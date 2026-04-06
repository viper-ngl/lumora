// bot/events/ready.js
const { ActivityType } = require('discord.js');

module.exports = {
  name: 'ready',
  once: true,
  execute(client) {
    console.log(`[Lumora] ✅ Online as ${client.user.tag}`);
    console.log(`[Lumora] Serving ${client.guilds.cache.size} guilds`);
    let i = 0;
    const statuses = [
      { name: '/help | Lumora Services', type: ActivityType.Playing },
      { name: 'your server', type: ActivityType.Watching },
      { name: `${client.guilds.cache.size} servers`, type: ActivityType.Watching },
    ];
    const rotate = () => { client.user.setActivity(statuses[i++ % statuses.length]); };
    rotate();
    setInterval(rotate, 30000);
  }
};
