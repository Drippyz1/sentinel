const titles: Record<string, string> = {
  '/': 'Overview',
  '/processes': 'Processes',
  '/network': 'Network Connections',
  '/system': 'System',
  '/storage': 'Storage Explorer',
  '/duplicates': 'Duplicate Files',
  '/history': 'History',
  '/alerts': 'Alerts',
  '/settings': 'Settings'
}

export function pageName(path: string): string {
  return titles[path] ?? titles['/']
}
