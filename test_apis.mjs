import https from 'https';

function fetchUrl(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function test() {
  const providers = ['shortmax', 'goodshort', 'netshort', 'freereels', 'dramanova', 'pinedrama', 'dramabox', 'reelshort'];
  for (const p of providers) {
    try {
      const resLatest = await fetchUrl(`https://api.sansekai.my.id/api/${p}/latest`);
      const resForyou = await fetchUrl(`https://api.sansekai.my.id/api/${p}/foryou`);
      console.log(`${p}: latest=${resLatest.status}, foryou=${resForyou.status}`);
    } catch (e) {
      console.log(`${p}: ERROR ${e.message}`);
    }
  }
}

test();
