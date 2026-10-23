import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "./page";

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

describe("Page", () => {
  beforeEach(() => {
    delete process.env.API_URL;
    vi.stubGlobal("fetch", vi.fn());
  });

  it("renders items from the api", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([{ id: "item-1", name: "demo" }]), {
        status: 200,
      }),
    );

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("demo");
    expect(html).toContain("item-1");
    expect(html).toContain("<label");
    expect(html).toContain('id="name"');
    expect(html).toContain("追加");
    expect(fetch).toHaveBeenCalledWith("http://localhost:3000/items", {
      cache: "no-store",
    });
  });

  it("renders the empty state", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 }),
    );

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("まだ item はありません");
  });

  it("renders an error when the response is not ok", async () => {
    vi.mocked(fetch).mockResolvedValue(new Response("nope", { status: 500 }));

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("items の取得に失敗しました");
    expect(html).toContain("追加");
  });

  it("renders an error when fetch throws", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("network"));

    const html = renderToStaticMarkup(await Page());

    expect(html).toContain("items の取得に失敗しました");
  });
});
