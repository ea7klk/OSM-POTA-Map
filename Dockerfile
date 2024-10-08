# Use the official Nginx image as a parent image
FROM nginx:alpine

# Copy all static content to Nginx serve directory in a single command
COPY index.html styles.css script.js pota_marker.png pota-logo-38x38.png /usr/share/nginx/html/

# Copy the Nginx configuration template
COPY nginx.conf.template /etc/nginx/templates/default.conf.template

# Expose port 80
EXPOSE 80

# Use the environment variables in the Nginx configuration
ENV MATOMO_URL="https://example.com/"
ENV MATOMO_SITE_ID="1"

# Start Nginx when the container has provisioned
CMD ["nginx", "-g", "daemon off;"]