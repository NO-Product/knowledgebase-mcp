# Registry Readiness

Before submitting this server to any MCP registry or public catalog:

- add the final public repository URL to the README Deploy with Vercel link, if the public repo wants a button;
- verify the deployed `serverInfo.name`, `title`, `description`, `websiteUrl`, and icons;
- confirm `initialize` advertises only implemented capabilities;
- test stdio and HTTP modes with MCP Inspector;
- confirm example content is synthetic or redistributable;
- confirm docs describe auth accurately and do not imply OAuth support;
- publish clear support, security, and licensing files;
- document which surfaces are enabled in the hosted deployment.

MCPB packaging is a separate future deliverable. Keep local packaging separate from the Vercel-first HTTP template until the server contract is stable.
