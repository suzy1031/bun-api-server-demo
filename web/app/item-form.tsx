"use client";

import { useActionState } from "react";
import { createItem, type CreateItemState } from "./actions";

const initialState: CreateItemState = { error: null };

export function ItemForm() {
  const [state, formAction, pending] = useActionState(createItem, initialState);

  return (
    <form action={formAction}>
      <label htmlFor="name">name</label>
      <input id="name" name="name" type="text" />
      <button type="submit" disabled={pending}>
        追加
      </button>
      {state.error ? <p role="alert">{state.error}</p> : null}
    </form>
  );
}
