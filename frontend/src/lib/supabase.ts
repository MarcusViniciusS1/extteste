// Cliente de dados do app.
//
// Isto NÃO é mais o cliente Supabase de verdade — é uma camada compatível
// que fala com o servidor Node local (server/index.js), que por sua vez
// conversa com o Postgres local em português (zorte_tickets). Mantém o
// mesmo formato de chamadas (`supabase.from(tabela).select(...)...`) que
// o resto do app já usa, então nenhuma tela precisou ser reescrita.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) || 'http://localhost:3001';

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- shim genérico: cada chamador tipa via generics/casts no ponto de uso.
type Result<T = any> = { data: T | null; error: { message: string } | null; count?: number };

function parseEmbeds(select: string): string[] {
  return [...select.matchAll(/(\w+)\(\*\)/g)].map((m) => m[1]);
}

class QueryBuilder implements PromiseLike<Result> {
  private embeds: string[] = [];
  private countMode = false;
  private orderCol?: string;
  private orderAsc = true;
  private limitN?: number;
  private eqFilters: Record<string, unknown> = {};
  private ilikeFilters: Record<string, unknown> = {};
  private mode: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: unknown;

  constructor(private table: string) {}

  select(cols = '*', opts?: { count?: 'exact'; head?: boolean }) {
    this.embeds = parseEmbeds(cols);
    if (opts?.count) this.countMode = true;
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  eq(col: string, val: unknown) {
    this.eqFilters[col] = val;
    return this;
  }
  ilike(col: string, val: unknown) {
    this.ilikeFilters[col] = val;
    return this;
  }
  insert(obj: unknown) {
    this.mode = 'insert';
    this.payload = obj;
    return this;
  }
  update(obj: unknown) {
    this.mode = 'update';
    this.payload = obj;
    return this;
  }
  delete() {
    this.mode = 'delete';
    return this;
  }

  async maybeSingle(): Promise<Result> {
    const res = await this.run();
    if (res.error) return res;
    const data = Array.isArray(res.data) ? res.data[0] ?? null : res.data;
    return { ...res, data };
  }

  async single(): Promise<Result> {
    return this.maybeSingle();
  }

  then<T1 = Result, T2 = never>(
    onFulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onRejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null
  ): PromiseLike<T1 | T2> {
    return this.run().then(onFulfilled, onRejected);
  }

  private async run(): Promise<Result> {
    try {
      if (this.mode === 'select') {
        const params = new URLSearchParams();
        if (this.embeds.length) params.set('embed', this.embeds.join(','));
        if (this.orderCol) {
          params.set('order_by', this.orderCol);
          params.set('order_dir', this.orderAsc ? 'asc' : 'desc');
        }
        if (this.limitN) params.set('limit', String(this.limitN));
        if (this.countMode) params.set('count', '1');
        for (const [k, v] of Object.entries(this.eqFilters)) params.set(`eq.${k}`, String(v));
        for (const [k, v] of Object.entries(this.ilikeFilters)) params.set(`ilike.${k}`, String(v));
        const res = await fetch(`${API_URL}/api/${this.table}?${params.toString()}`);
        const json = await res.json();
        if (!res.ok) return { data: null, error: { message: json.error || 'Erro na API' } };
        if (this.countMode) return { data: null, error: null, count: json.count };
        return { data: json.data, error: null };
      }
      if (this.mode === 'insert') {
        const params = new URLSearchParams();
        if (this.embeds.length) params.set('embed', this.embeds.join(','));
        const res = await fetch(`${API_URL}/api/${this.table}?${params.toString()}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.payload),
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: { message: json.error || 'Erro na API' } };
        return { data: json.data, error: null };
      }
      if (this.mode === 'update') {
        const id = this.eqFilters.id;
        const res = await fetch(`${API_URL}/api/${this.table}/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.payload),
        });
        const json = await res.json();
        if (!res.ok) return { data: null, error: { message: json.error || 'Erro na API' } };
        return { data: json.data, error: null };
      }
      // delete
      const id = this.eqFilters.id;
      const res = await fetch(`${API_URL}/api/${this.table}/${id}`, { method: 'DELETE' });
      const json = await res.json();
      if (!res.ok) return { data: null, error: { message: json.error || 'Erro na API' } };
      return { data: json.data, error: null };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Falha de rede';
      return { data: null, error: { message } };
    }
  }
}

export const supabase = {
  from(table: string) {
    return new QueryBuilder(table);
  },
};
