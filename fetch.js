import https from 'https';

https.get('https://ema.io.vn/assembly/viewer.html?ws=1C5k&code=sE&part=1', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    // extract script tags
    const scripts = data.match(/<script.*?src="(.*?)".*?><\/script>/g) || [];
    const css = data.match(/<link.*?href="(.*?)".*?>/g) || [];
    console.log('Scripts:', scripts.join('\n'));
    console.log('CSS:', css.join('\n'));
    if (data.includes('three.js') || data.includes('THREE')) console.log('Found Three.js');
    if (data.includes('babylon')) console.log('Found Babylon.js');
    if (data.includes('react')) console.log('Found React');
  });
}).on('error', (err) => {
  console.log('Error: ', err.message);
});
