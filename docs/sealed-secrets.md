# Sealed Secrets

The `fleet/sealed-secrets` bundle installs the Sealed Secrets controller in `kube-system`. Fleet deploys it from the pinned Bitnami chart version recorded in `fleet/sealed-secrets/fleet.yaml`. The controller key stays in the cluster as the Secret `sealed-secrets-key`.

## Secret placement

The Docker registry pull credentials used by workloads are stored as namespace and name scoped SealedSecrets in `fleet/potamap/sealed-secrets.yaml`. The encrypted manifests can be committed to this public repository; the controller private key and the original credentials must never be committed.

The `potamap-env` values are application configuration, so Fleet defines them directly on the Deployment. GitHub bootstrap credentials and other credentials for private Fleet sources remain outside this repository.

## Updating an encrypted Secret

Use an authorized machine with cluster access and the matching `kubeseal` release. Keep the plaintext Secret in a pipe; do not write it to a repository, shell history, or logs. Remove live-cluster metadata and old tracking annotations before sealing, then use strict scope so decryption is bound to the exact namespace and Secret name:

```sh
kubectl get secret -n NAMESPACE SECRET_NAME -o json \
  | jq 'del(.metadata.managedFields, .metadata.resourceVersion, .metadata.uid, .metadata.creationTimestamp, .metadata.ownerReferences, .metadata.labels, .metadata.annotations) | .metadata.annotations = {"sealedsecrets.bitnami.com/managed":"true","sealedsecrets.bitnami.com/skip-set-owner-references":"true"}' \
  | kubeseal --controller-name sealed-secrets-controller --controller-namespace kube-system --scope strict --format yaml \
  > /secure/path/SECRET_NAME.sealed.yaml
```

Review the output to confirm it contains `spec.encryptedData` and no `data` field, then update the matching manifest and let Fleet reconcile it. Verify the SealedSecret reports ready and the workload can pull its image. Keep the existing live Secret until that verification passes.

## Controller key recovery

Back up the controller private key outside GitHub using an approved encrypted, access-controlled secret store. The key is required to decrypt existing manifests after a cluster loss; if it is lost, recover credentials from their source and reseal them with the replacement controller certificate. Do not print or commit the key.