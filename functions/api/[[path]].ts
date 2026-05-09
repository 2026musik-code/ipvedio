export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const path = url.pathname; // /api/...
  
  if (path === '/api/latest') {
     // ...
  }
}
