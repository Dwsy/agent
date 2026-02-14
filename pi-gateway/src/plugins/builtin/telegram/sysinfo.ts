import { cpus, totalmem, freemem, hostname, platform, arch, uptime, loadavg, networkInterfaces } from "node:os";

function fmtBytes(bytes: number): string {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts: string[] = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  parts.push(`${m}m`);
  return parts.join(" ");
}

function cpuUsagePercent(): string {
  const cores = cpus();
  let totalIdle = 0, totalTick = 0;
  for (const c of cores) {
    const { user, nice, sys, idle, irq } = c.times;
    totalTick += user + nice + sys + idle + irq;
    totalIdle += idle;
  }
  return ((1 - totalIdle / totalTick) * 100).toFixed(1);
}

async function diskInfo(): Promise<string[]> {
  try {
    const proc = Bun.spawn(["df", "-h"], { stdout: "pipe", stderr: "pipe" });
    const out = await new Response(proc.stdout).text();
    await proc.exited;
    const lines = out.trim().split("\n").slice(1);
    const result: string[] = [];
    for (const line of lines) {
      const cols = line.split(/\s+/);
      if (cols.length < 6) continue;
      const mount = cols.slice(5).join(" ");
      if (mount === "/" || mount.startsWith("/home") || mount.startsWith("/Users") || mount === "/tmp") {
        result.push(`  ${mount}: ${cols[2]}/${cols[1]} (${cols[4]})`);
      }
    }
    return result.length ? result : [`  /: ${lines[0]?.split(/\s+/).slice(1, 5).join(" ") ?? "N/A"}`];
  } catch {
    return ["  N/A"];
  }
}

function netInfo(): string[] {
  const ifaces = networkInterfaces();
  const result: string[] = [];
  for (const [name, addrs] of Object.entries(ifaces)) {
    if (!addrs || name === "lo" || name === "lo0") continue;
    const ipv4 = addrs.find(a => a.family === "IPv4" && !a.internal);
    if (ipv4) result.push(`  ${name}: ${ipv4.address}`);
  }
  return result.length ? result : ["  No external interface"];
}

export async function collectSysInfo(): Promise<string> {
  const total = totalmem();
  const free = freemem();
  const used = total - free;
  const cores = cpus();
  const load = loadavg();
  const disk = await diskInfo();
  const net = netInfo();

  return [
    `<b>🖥 System Info</b>`,
    ``,
    `<b>Host:</b> ${hostname()}`,
    `<b>OS:</b> ${platform()} ${arch()}`,
    `<b>Uptime:</b> ${fmtUptime(uptime())}`,
    `<b>Bun:</b> ${Bun.version}`,
    ``,
    `<b>CPU:</b> ${cores[0]?.model?.trim() ?? "unknown"}`,
    `<b>Cores:</b> ${cores.length}  <b>Usage:</b> ${cpuUsagePercent()}%`,
    `<b>Load:</b> ${load.map(l => l.toFixed(2)).join(" / ")}`,
    ``,
    `<b>Memory:</b> ${fmtBytes(used)} / ${fmtBytes(total)} (${((used / total) * 100).toFixed(1)}%)`,
    `<b>Free:</b> ${fmtBytes(free)}`,
    ``,
    `<b>Disk:</b>`,
    ...disk,
    ``,
    `<b>Network:</b>`,
    ...net,
  ].join("\n");
}
