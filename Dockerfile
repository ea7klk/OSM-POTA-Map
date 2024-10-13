# Use Node.js 22.9 as the base image
FROM node:22.9

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install Node.js dependencies
RUN npm install

# Copy the rest of the application
COPY ./ .

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables with default values
ENV MATOMO_ENABLED=false
ENV MATOMO_URL=
ENV MATOMO_SITE_ID=

# Start the Node.js server
CMD ["node", "server.js"]