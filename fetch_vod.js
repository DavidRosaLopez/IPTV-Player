const http = require('http');
const server = 'http://cf.futuremyprovt.com';
const user = 'f7f23dd33459';
const pass = '604a8e6f2c';

http.get(`${server}/player_api.php?username=${user}&password=${pass}&action=get_vod_streams`, (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    try {
      const parsed = JSON.parse(data);
      console.log(JSON.stringify(parsed.slice(0, 3), null, 2));
    } catch(e) { console.error(e); }
  });
});
