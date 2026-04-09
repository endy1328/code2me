export function nodeId(projectId: string, type: string, key: string): string {
  return `${projectId}:${type}:${key}`;
}

export function edgeId(projectId: string, type: string, from: string, to: string): string {
  return `${projectId}:${type}:${from}->${to}`;
}
