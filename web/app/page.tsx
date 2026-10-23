import { ItemForm } from "./item-form";

type Item = {
  id: string;
  name: string;
};

function apiUrl() {
  return process.env.API_URL ?? "http://localhost:3000";
}

async function loadItems(): Promise<{ items: Item[]; error: string | null }> {
  try {
    const response = await fetch(`${apiUrl()}/items`, { cache: "no-store" });
    if (!response.ok) {
      return { items: [], error: "items の取得に失敗しました" };
    }
    const items = (await response.json()) as Item[];
    return { items, error: null };
  } catch {
    return { items: [], error: "items の取得に失敗しました" };
  }
}

export default async function Page() {
  const { items, error } = await loadItems();

  return (
    <main>
      <h1>items</h1>
      <ItemForm />
      {error ? (
        <p role="alert">{error}</p>
      ) : items.length === 0 ? (
        <p>まだ item はありません</p>
      ) : (
        <ul>
          {items.map((item) => (
            <li key={item.id}>
              {item.name} <span>{item.id}</span>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
