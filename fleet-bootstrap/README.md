# Fleet bootstrap

`gitrepos.yaml` contains the Fleet GitRepo resources needed to restore this cluster's Fleet sources. The private infra source uses the existing `fleet-local/github-auth` Secret; the public OSM-POTA-Map source needs no GitHub credential. The file contains Secret references only, never credential values.

The k3s server loads the active bootstrap copy from `/var/lib/rancher/k3s/server/manifests/fleet-gitrepos.yaml`. After changing this file, copy it to that path and verify both GitRepos report Ready. Keep `github-auth` out of GitHub and manage it directly in Kubernetes or through the chosen protected secret manager.
