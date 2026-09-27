// Direcciones IPv4 de la red local para mostrar a los jugadores (WiFi / Ethernet).
import os from 'node:os';

const VIRTUAL = /(vethernet|wsl|virtualbox|vmware|hyper-v|docker|vbox|loopback|tailscale|zerotier|hamachi|bluetooth|npcap|tap|tun)/i;

export function lanAddresses() {
  const out = [];
  for (const [name, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal) continue;
      if (a.address.startsWith('169.254.')) continue;
      const virtual = VIRTUAL.test(name);
      let score = 0;
      if (/wi-?fi|wlan|wireless|inal/i.test(name)) score += 3;
      if (/ethernet|eth|en\d|enp|eno/i.test(name)) score += 2;
      if (a.address.startsWith('192.168.')) score += 2;
      else if (a.address.startsWith('10.')) score += 1;
      if (virtual) score -= 10;
      out.push({ name, address: a.address, score, virtual });
    }
  }
  out.sort((x, y) => y.score - x.score);
  return out;
}
