// All VITE_* values are public and embedded in the browser bundle.
export const env = {
  apiBaseUrl:
    import.meta.env.VITE_API_BASE_URL?.trim() || 'http://localhost:3000',
  auth0Domain: import.meta.env.VITE_AUTH0_DOMAIN?.trim() || '',
  auth0ClientId: import.meta.env.VITE_AUTH0_CLIENT_ID?.trim() || '',
  auth0Audience: import.meta.env.VITE_AUTH0_AUDIENCE?.trim() || '',
  auth0PermissionsClaim:
    import.meta.env.VITE_AUTH0_PERMISSIONS_CLAIM?.trim() ||
    'https://audit-trail.example.com/permissions',
  auth0TenantClaim:
    import.meta.env.VITE_AUTH0_TENANT_CLAIM?.trim() ||
    'https://audit-trail.example.com/tenantId',
  launchDarklyClientId:
    import.meta.env.VITE_LAUNCHDARKLY_CLIENT_ID?.trim() || '',
};
