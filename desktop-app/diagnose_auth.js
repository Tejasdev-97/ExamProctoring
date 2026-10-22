async function main() {
  const res = await fetch('http://127.0.0.1:9222/json');
  const pages = await res.json();
  const page = pages.find(p => p.type === 'page');
  if (!page) {
    console.error('No page target found');
    process.exit(1);
  }

  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 1;
  const send = (method, params = {}) => {
    return new Promise((resolve, reject) => {
      const msgId = id++;
      const handler = (e) => {
        const data = JSON.parse(e.data);
        if (data.id === msgId) {
          ws.removeEventListener('message', handler);
          if (data.error) reject(data.error);
          else resolve(data.result);
        }
      };
      ws.addEventListener('message', handler);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  };

  await new Promise((resolve) => { ws.onopen = resolve; });

  const networkEvents = [];
  const consoleLogs = [];

  ws.addEventListener('message', (e) => {
    const data = JSON.parse(e.data);
    if (data.method === 'Network.requestWillBeSent') {
      networkEvents.push({
        event: 'requestWillBeSent',
        url: data.params.request.url,
        method: data.params.request.method,
        headers: data.params.request.headers
      });
    } else if (data.method === 'Network.responseReceived') {
      networkEvents.push({
        event: 'responseReceived',
        url: data.params.response.url,
        status: data.params.response.status,
        headers: data.params.response.headers
      });
    } else if (data.method === 'Runtime.consoleAPICalled') {
      consoleLogs.push({
        type: data.params.type,
        args: data.params.args.map(a => a.value || a.description)
      });
    }
  });

  await send('Network.enable');
  await send('Runtime.enable');

  // Check stored session info (safe metadata only)
  const sessionInfo = await send('Runtime.evaluate', {
    expression: `(() => {
      const token = localStorage.getItem('ep_access_token');
      const user = localStorage.getItem('ep_user');
      return {
        hasToken: Boolean(token),
        tokenLength: token ? token.length : 0,
        url: window.location.href,
        user: user ? JSON.parse(user) : null
      };
    })()`,
    returnByValue: true
  });

  console.log('--- SESSION INFO ---');
  console.log(JSON.stringify(sessionInfo.result.value, null, 2));

  // Test resolving code 480223 from the renderer using the stored session
  const resolveTest = await send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const token = localStorage.getItem('ep_access_token');
        const res = await fetch('https://examproctor-backend-2yfp.onrender.com/api/v1/exams/resolve-code', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          },
          body: JSON.stringify({ exam_code: '480223' })
        });
        const data = await res.json();
        return { status: res.status, ok: res.ok, data };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('\n--- RESOLVE-CODE TEST ---');
  console.log(JSON.stringify(resolveTest.result.value, null, 2));

  // Test /attempts/authorize with 480223 from the renderer
  const authorizeTest = await send('Runtime.evaluate', {
    expression: `(async () => {
      try {
        const token = localStorage.getItem('ep_access_token');
        const res = await fetch('https://examproctor-backend-2yfp.onrender.com/api/v1/attempts/authorize', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': 'Bearer ' + token } : {})
          },
          body: JSON.stringify({ exam_code: '480223' })
        });
        const data = await res.json();
        return { status: res.status, ok: res.ok, data };
      } catch (e) {
        return { error: e.message };
      }
    })()`,
    awaitPromise: true,
    returnByValue: true
  });
  console.log('\n--- ATTEMPTS/AUTHORIZE TEST ---');
  console.log(JSON.stringify(authorizeTest.result.value, null, 2));

  ws.close();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
