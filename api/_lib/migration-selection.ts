export type MigrationConnectionChoice = { id: string; status?: string };

export function chooseMigrationConnection<T extends MigrationConnectionChoice>(connections: T[], id?: unknown): T | null {
  if (typeof id === 'string' && id) {
    const match = connections.find(connection => connection.id === id);
    if (!match) throw Object.assign(new Error('The selected connection does not belong to this organization and provider'), { statusCode: 404 });
    return match;
  }
  if (connections.length > 1) throw Object.assign(new Error('Select the source account before continuing'), { statusCode: 400 });
  return connections[0] ?? null;
}

export function jobberReadQuery(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200000 || !/^\s*(query\b|\{)/.test(value) || /\b(mutation|subscription)\b/.test(value)) {
    throw Object.assign(new Error('Only bounded Jobber read queries are accepted'), { statusCode: 400 });
  }
  return value;
}
