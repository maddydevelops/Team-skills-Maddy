# Forms & Tables Engineer — Coding Standards

This document defines the coding standards for building **admin listing pages** in this project. It covers server-side auth guards, Formik + Yup form management, React Query data fetching and mutation patterns, table rendering, pagination, confirmations, and tooltips.

---

## Table of Contents

1. [Server-Side Auth Guard (Page Shell)](#1-server-side-auth-guard-page-shell)
2. [Formik Setup](#2-formik-setup)
3. [Yup Validation Schema](#3-yup-validation-schema)
4. [Error, Touched & Submit Handling](#4-error-touched--submit-handling)
5. [React Query — Hooks File Structure](#5-react-query--hooks-file-structure)
6. [React Query — Fetching & Mutations in a Component](#6-react-query--fetching--mutations-in-a-component)
7. [Add vs. Edit in a Single Form (action pattern)](#7-add-vs-edit-in-a-single-form-action-pattern)
8. [Table Rendering](#8-table-rendering)
9. [CustomPagination](#9-custompagination)
10. [CustomTooltip on Action Buttons](#10-customtooltip-on-action-buttons)
11. [AlertModal — Delete / Destructive Confirmation](#11-alertmodal--delete--destructive-confirmation)
12. [Toast Notifications](#12-toast-notifications)
13. [Full Page Skeleton](#13-full-page-skeleton)

---

## 1. Server-Side Auth Guard (Page Shell)

Every protected route is split into **two files**:

| File                                                              | Type                                  | Responsibility                                                                          |
| ----------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------------------------------- |
| `page.tsx`                                                        | **Server Component**                  | Session check, role/permission check, redirect on failure, pass minimal props to client |
| `<Feature>Client.tsx` (or inline in `page.tsx` as a named export) | **Client Component** (`"use client"`) | All UI, state, Formik, React Query                                                      |

### Rules

- `page.tsx` must **never** contain `"use client"`.
- All redirects happen **server-side** via `next/navigation` `redirect()` — never with `useRouter` for auth guards.
- `getServerSession(authOptions)` is the only way to read the session in a page shell.
- Permission checks (`checkRolePermission`) are awaited **after** the session check so unauthenticated users never hit the permission query.
- The client component does **not** repeat session/auth checks — that is the page shell's sole job.

### Redirect destinations

| Condition                           | Redirect     |
| ----------------------------------- | ------------ |
| No session / not logged in          | `/login`     |
| Logged in but wrong role/permission | `/forbidden` |

### Example — `page.tsx` (server component)

```tsx
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { checkRolePermission } from "@/lib/permissions";
import { SubscriptionsClient } from "./SubscriptionsClient";

export default async function SubscriptionsPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    redirect("/login");
  }

  const hasPermission = await checkRolePermission(
    session.user.role,
    "subscriptions:list"
  );
  if (!hasPermission) {
    redirect("/forbidden");
  }

  return <SubscriptionsClient session={session} />;
}
```

### Example — `SubscriptionsClient.tsx` (client component)

```tsx
"use client";

export const SubscriptionsClient = ({ session }: any) => {
  // All hooks, state, Formik, React Query go here.
  // No session check — the page shell already handled it.
  return <SubscriptionListing session={session} />;
};
```

### What NOT to do in the client component

```tsx
// ✗ — Do NOT repeat auth/session checks in the client component
const { data: session } = useSession();
useEffect(() => {
  if (!session || session.user.role !== "SUPERADMIN") {
    router.push("/blocked");
  }
}, [session]);
```

---

## 2. Formik Setup

`useFormik` is **always defined inside the listing component**, not in a separate file.

### Rules

- `initialValues` must include `action` (`"create"` | `"view"`) and `open` (`boolean`) to control dialog state alongside data.
- `validateOnChange` is **false**; `validateOnBlur` is **true**.
- `onSubmit` branches on `values.action` to call the correct mutation.
- Always call `formik.resetForm()` after a successful mutation and inside the cancel / dialog-close handler.

### Example

```tsx
const formik = useFormik({
  initialValues: {
    name: "",
    price: 0,
    yearly_price: 0,
    description: "",
    features: [],
    best_for: [],
    action: "create", // "create" | "view"
    open: false, // controls Dialog visibility
  },
  validationSchema,
  validateOnChange: false,
  validateOnBlur: true,
  onSubmit: async (values) => {
    try {
      if (values.action === "create") {
        await addMutation.mutateAsync({ ...values } as any);
      } else {
        await updateMutation.mutateAsync({ ...values } as any);
      }
      formik.resetForm();
    } catch (error) {
      ToastErrorMessage(error);
    }
  },
});
```

---

## 3. Yup Validation Schema

The Yup schema is declared **inside the component** (above `useFormik`) as a `const` named `validationSchema`.

### Rules

- Use `yup.object({ ... })`.
- Required fields use `.required("Field name is required")`.
- Numeric fields chain `.positive(...)` when the value must be greater than zero.
- Optional fields are left without `.required()`.

### Example

```tsx
const validationSchema = yup.object({
  name: yup.string().required("Name is required"),
  price: yup
    .number()
    .required("Monthly price is required")
    .positive("Monthly price must be greater than 0"),
  yearly_price: yup
    .number()
    .required("Yearly price is required")
    .positive("Yearly price must be greater than 0"),
  // optional — no .required()
  description: yup.string(),
});
```

---

## 4. Error, Touched & Submit Handling

### Input error props

Every `<Input>` receives two props for inline validation feedback:

| Prop         | Value                                                          |
| ------------ | -------------------------------------------------------------- |
| `error`      | `Boolean(formik.touched.fieldName && formik.errors.fieldName)` |
| `helperText` | `formik.errors.fieldName as string`                            |

```tsx
<Input
  id="name"
  name="name"
  placeholder="Name"
  value={formik.values.name}
  onChange={formik.handleChange}
  onBlur={formik.handleBlur}
  error={Boolean(formik.touched.name && formik.errors.name)}
  helperText={formik.errors.name as string}
/>
```

### Submit button disabled state

The submit button is disabled while **any** of these conditions is true:

```tsx
<Button
  type="submit"
  disabled={
    isLoadingData ||
    formik.isSubmitting ||
    addMutation.isPending ||
    updateMutation.isPending
  }
  onClick={() => formik.handleSubmit()}
>
  {formik.values.action === "create" ? "Add Item" : "Update Item"}
</Button>
```

> **Note:** Both `type="submit"` on the button and an explicit `onClick={() => formik.handleSubmit()}` are provided to ensure the form submits inside a Dialog where the `<form>` wraps `<DialogContent>`.

### Form wrapper inside Dialog

Wrap `<DialogContent>` inside `<form onSubmit={formik.handleSubmit}>`, **not** the other way around:

```tsx
<Dialog open={formik.values.open} onOpenChange={() => formik.resetForm()}>
  <form onSubmit={formik.handleSubmit} className="space-y-4">
    <DialogContent className="sm:max-w-md">
      {/* fields */}
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={() => formik.resetForm()}
        >
          Cancel
        </Button>
        <Button
          type="submit"
          disabled={
            formik.isSubmitting ||
            addMutation.isPending ||
            updateMutation.isPending
          }
          onClick={() => formik.handleSubmit()}
        >
          {formik.values.action === "create" ? "Add" : "Update"}
        </Button>
      </DialogFooter>
    </DialogContent>
  </form>
</Dialog>
```

---

## 5. React Query — Hooks File Structure

Every entity has its own file at `hooks/use<Entity>.ts`.

### Query key factory

Always define a `<entity>Keys` object at the top of the file using the factory pattern:

```ts
export const subscriptionKeys = {
  all: ["subscriptions"] as const,
  lists: () => [...subscriptionKeys.all, "list"] as const,
  list: (filters: {
    search: string;
    rowsPerPage: string;
    page: string;
    fetchAll?: boolean;
  }) => [...subscriptionKeys.lists(), filters] as const,
};
```

### Hook naming convention

| Hook                        | Purpose              |
| --------------------------- | -------------------- |
| `use<Entity>s(filters)`     | Fetch paginated list |
| `useAdd<Entity>()`          | POST create          |
| `useUpdate<Entity>()`       | POST update          |
| `useDelete<Entity>()`       | POST delete          |
| `useToggle<Entity>Status()` | POST status toggle   |

### Fetch hook

```ts
export const useSubscriptions = (filters: FetchSubscriptionsParams) => {
  return useQuery<FetchSubscriptionsResponse>({
    queryKey: subscriptionKeys.list(filters),
    queryFn: async () => {
      try {
        const response = await axios.post(
          "/api/subscriptions/fetchsubscriptions",
          filters
        );
        return response.data;
      } catch (error) {
        ToastErrorMessage(error);
        return { data: [], count: 0 };
      }
    },
    enabled: true,
  });
};
```

### Mutation hook — cache update pattern

After a successful mutation, **directly update the React Query cache** using `queryClient.setQueriesData` instead of invalidating and re-fetching. Use the `.lists()` key (not the `.list(filters)` key) so all active list queries are updated simultaneously.

```ts
// ADD — prepend to list, increment count
onSuccess: (newItem) => {
  queryClient.setQueriesData<FetchResponse>(
    { queryKey: entityKeys.lists() },
    (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        data: [newItem, ...oldData.data],
        count: oldData.count + 1,
      };
    }
  );
  ToastSuccessMessage("Item added successfully!");
},

// UPDATE — replace matching item by id
onSuccess: (updatedItem) => {
  queryClient.setQueriesData<FetchResponse>(
    { queryKey: entityKeys.lists() },
    (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        data: oldData.data.map((item) =>
          item.id === updatedItem.id ? updatedItem : item
        ),
      };
    }
  );
  ToastSuccessMessage("Item updated successfully!");
},

// DELETE — filter out by id, decrement count
onSuccess: (deleted, deletedId) => {
  const idToDelete = deleted?.id || deletedId;
  queryClient.setQueriesData<FetchResponse>(
    { queryKey: entityKeys.lists() },
    (oldData) => {
      if (!oldData) return oldData;
      return {
        ...oldData,
        data: oldData.data.filter((item) => item.id !== idToDelete),
        count: oldData.count - 1,
      };
    }
  );
  ToastSuccessMessage("Item deleted successfully!");
},

// All mutations
onError: (error: any) => {
  ToastErrorMessage(error);
},
```

---

## 6. React Query — Fetching & Mutations in a Component

Consume hooks at the top of the listing component, right after state declarations:

```tsx
const { data: subscriptionsData, isLoading: isLoadingSubscriptions } =
  useSubscriptions(filter);

const addSubscriptionMutation = useAddSubscription();
const updateSubscriptionMutation = useUpdateSubscription();
const deleteSubscriptionMutation = useDeleteSubscription();
```

### Filter state

The filter object drives the query key — changing any filter triggers a fresh fetch automatically:

```tsx
const [filter, setFilter] = useState({
  search: "",
  rowsPerPage: "10",
  page: "1",
  fetchAll: false,
});
```

---

## 7. Add vs. Edit in a Single Form (action pattern)

Instead of maintaining separate `isOpen` / `selectedRow` / `mode` state variables, **embed `action` and `open` directly inside `formik.values`**.

### Opening the "Add" dialog

```tsx
<Button
  onClick={() =>
    formik.setValues({
      ...formik.values,
      action: "create",
      open: true,
    })
  }
>
  <IconPlus className="mr-2 h-4 w-4" />
  New Subscription
</Button>
```

### Opening the "Edit" dialog

Spread the row data directly into `formik.values`, then override `action` and `open`:

```tsx
<Button
  variant="outline"
  size="icon"
  onClick={() =>
    formik.setValues({
      ...formik.values,
      ...row, // populate all fields from the selected row
      action: "view", // "view" = edit mode
      open: true,
    } as any)
  }
>
  <IconEdit />
</Button>
```

### Closing the dialog / resetting

Both the cancel button and `onOpenChange` on the `<Dialog>` call `formik.resetForm()`. This clears all values (including `open: false`) via Formik's `initialValues`:

```tsx
<Dialog
  open={formik.values.open}
  onOpenChange={() => formik.resetForm()}
>
```

### Dialog title branching

```tsx
<DialogTitle>
  {formik.values.action === "create"
    ? "Add Subscription"
    : "Update Subscription"}
</DialogTitle>
```

---

## 8. Table Rendering

### Structure

```tsx
<Card>
  <CardContent>
    {isLoadingSubscriptions ? (
      <div className="flex items-center justify-center py-12">
        <Loader loading={isLoadingSubscriptions} />
      </div>
    ) : (
      <div className="max-h-[55vh] overflow-y-auto">
        {data?.data && data.data.length > 0 ? (
          <>
            <Table className="w-full">
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.data.map((row: EntityType) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.name}</TableCell>
                    <TableCell className="flex justify-end gap-2">
                      {/* action buttons */}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <CustomPagination {...paginationProps} />
          </>
        ) : (
          <TableRow>
            <TableCell
              colSpan={9}
              className="text-muted-foreground py-8 text-center"
            >
              No records found
            </TableCell>
          </TableRow>
        )}
      </div>
    )}
  </CardContent>
</Card>
```

### Rules

- Always wrap the table in a `max-h-[55vh] overflow-y-auto` div for vertical scrolling.
- Show a `<Loader>` centered while `isLoading` is `true`.
- Show an empty-state `<TableCell colSpan={N}>` row when the array is empty.
- Action column header uses `className="text-right"` and action cell content uses `flex justify-end`.

---

## 9. CustomPagination

Place `<CustomPagination>` directly below `</Table>`, still inside the truthy data branch.

### Props

| Prop                 | Type                      | Description                                      |
| -------------------- | ------------------------- | ------------------------------------------------ |
| `page`               | `number`                  | Current page (parsed from `filter.page`)         |
| `setPage`            | `(page: string) => void`  | Updates `filter.page`                            |
| `totalPages`         | `number`                  | `Math.ceil(count / rowsPerPage)`                 |
| `rowsPerPage`        | `string`                  | Current rows-per-page from filter                |
| `setRowsPerPage`     | `(value: string) => void` | Updates `rowsPerPage` and resets `page` to `"1"` |
| `count`              | `number`                  | Total record count from API                      |
| `paginationOptioins` | `string[]`                | Available page-size options                      |

### Example

```tsx
<CustomPagination
  page={Number(filter.page)}
  setPage={(page) => setFilter({ ...filter, page })}
  totalPages={Math.ceil(subscriptionsData?.count / Number(filter.rowsPerPage))}
  rowsPerPage={filter.rowsPerPage}
  setRowsPerPage={(value) =>
    setFilter((prev) => ({ ...prev, rowsPerPage: value, page: "1" }))
  }
  count={subscriptionsData?.count}
  paginationOptioins={["10", "20", "50", "100"]}
/>
```

> **Always reset `page` to `"1"` when `rowsPerPage` changes.**

---

## 10. CustomTooltip on Action Buttons

Wrap every icon action button in `<CustomTooltip>`. Pass the `<Button>` as `trigger` and a plain string as `content`.

```tsx
<CustomTooltip
  trigger={
    <Button variant="outline" size="icon" onClick={handleEdit}>
      <IconEdit />
    </Button>
  }
  content="Edit"
/>

<CustomTooltip
  trigger={
    <Button variant="outline" size="icon" onClick={handleDelete}>
      <IconTrash />
    </Button>
  }
  content="Delete"
/>
```

---

## 11. AlertModal — Delete / Destructive Confirmation

Use a **single `alertState` object** for all confirmation dialogs on the page. Do **not** create separate boolean flags per action.

### State shape

```tsx
const [alertState, setAlertState] = useState({
  open: false,
  title: "",
  description: "",
  cancelText: "",
  confirmText: "",
  onConfirm: () => {},
  onClose: () => {},
  type: "info" as "info" | "danger" | "warning" | "success",
});
```

### Triggering a delete confirmation

```tsx
onClick={() =>
  setAlertState({
    open: true,
    title: "Delete Subscription",
    description: "Are you sure you want to delete this subscription?",
    cancelText: "Cancel",
    confirmText: "Delete",
    type: "danger",
    onConfirm: async () => {
      try {
        await deleteSubscriptionMutation.mutateAsync(row.id);
        setAlertState((prev) => ({ ...prev, open: false }));
      } catch {
        // error already handled by mutation's onError
      }
    },
    onClose: () => setAlertState((prev) => ({ ...prev, open: false })),
  })
}
```

### Rendering

Place `<AlertModal>` once at the bottom of the component JSX (outside the table card):

```tsx
<AlertModal {...alertState} />
```

### Type → button color mapping (handled by AlertModal internally)

| type      | Button color     |
| --------- | ---------------- |
| `danger`  | `bg-destructive` |
| `warning` | `bg-yellow-500`  |
| `info`    | `bg-primary`     |
| `success` | `bg-green-500`   |

---

## 12. Toast Notifications

Import from `@/components/ui/toast-messages`. Never call the `toast()` hook directly in pages or hooks files.

```ts
import {
  ToastSuccessMessage,
  ToastErrorMessage,
} from "@/components/ui/toast-messages";

// Success
ToastSuccessMessage("Subscription added successfully!");

// Error (pass the raw error object — the helper extracts the message)
ToastErrorMessage(error);
```

- `ToastSuccessMessage` accepts an optional second `text` argument appended with `-`.
- `ToastErrorMessage` reads `error.response.data.message` → `error.response.data.error` → fallback string automatically.
- Call `ToastErrorMessage` in `onError` of every mutation hook, not in the component.

---

## 13. Full Page Skeleton

Below is the canonical skeleton every new admin listing page should follow.

```tsx
"use client";
import { useRef, useState } from "react";
import * as yup from "yup";
import { useFormik } from "formik";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogTitle,
  DialogHeader,
  DialogContent,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { CustomTooltip } from "@/components/shared/CustomTooltip";
import { AlertModal } from "@/components/shared/AlertModal";
import CustomPagination from "@/components/shared/CustomPagination";
import { IconEdit, IconPlus, IconSearch, IconTrash } from "@tabler/icons-react";
import Loader from "@/components/ui/loader";
import { ToastErrorMessage } from "@/components/ui/toast-messages";

import {
  useItems,
  useAddItem,
  useUpdateItem,
  useDeleteItem,
} from "@/hooks/useItems";
import { Item } from "@/types";

// ─── Page shell (handles auth guard externally — not here) ───────────────────
const Page = () => <ItemListing />;
export default Page;

// ─── Listing Component ───────────────────────────────────────────────────────
const ItemListing = () => {
  const inputRef = useRef<HTMLInputElement>(null);

  const [filter, setFilter] = useState({
    search: "",
    rowsPerPage: "10",
    page: "1",
    fetchAll: false,
  });

  const [alertState, setAlertState] = useState({
    open: false,
    title: "",
    description: "",
    cancelText: "",
    confirmText: "",
    onConfirm: () => {},
    onClose: () => {},
    type: "info" as "info" | "danger" | "warning" | "success",
  });

  // ── React Query ────────────────────────────────────────────────────────────
  const { data: itemsData, isLoading } = useItems(filter);
  const addMutation = useAddItem();
  const updateMutation = useUpdateItem();
  const deleteMutation = useDeleteItem();

  // ── Yup schema ────────────────────────────────────────────────────────────
  const validationSchema = yup.object({
    name: yup.string().required("Name is required"),
  });

  // ── Formik ────────────────────────────────────────────────────────────────
  const formik = useFormik({
    initialValues: {
      name: "",
      action: "create",
      open: false,
    },
    validationSchema,
    validateOnChange: false,
    validateOnBlur: true,
    onSubmit: async (values) => {
      try {
        if (values.action === "create") {
          await addMutation.mutateAsync({ ...values } as any);
        } else {
          await updateMutation.mutateAsync({ ...values } as any);
        }
        formik.resetForm();
      } catch (error) {
        ToastErrorMessage(error);
      }
    },
  });

  return (
    <div className="w-full space-y-6">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold">Item Management</h3>
        <div className="flex items-center gap-2 justify-between mt-4">
          <Input
            ref={inputRef}
            placeholder="Search"
            onChange={(e) => {
              if (!e.target.value)
                setFilter((p) => ({ ...p, search: "", page: "1" }));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setFilter((p) => ({
                  ...p,
                  search: inputRef.current?.value || "",
                  page: "1",
                }));
              }
            }}
            trailingIcon={
              <IconSearch
                className="hover:cursor-pointer"
                onClick={() =>
                  setFilter((p) => ({
                    ...p,
                    search: inputRef.current?.value || "",
                    page: "1",
                  }))
                }
              />
            }
            className="mb-0"
          />
          <Button
            onClick={() =>
              formik.setValues({
                ...formik.values,
                action: "create",
                open: true,
              })
            }
          >
            <IconPlus className="mr-2 h-4 w-4" /> New Item
          </Button>
        </div>
      </div>

      {/* Table */}
      <Card>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader loading={isLoading} />
            </div>
          ) : (
            <div className="max-h-[55vh] overflow-y-auto">
              {itemsData?.data && itemsData.data.length > 0 ? (
                <>
                  <Table className="w-full">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {itemsData.data.map((row: Item) => (
                        <TableRow key={row.id}>
                          <TableCell>{row.name}</TableCell>
                          <TableCell>
                            <div className="flex justify-end gap-2">
                              <CustomTooltip
                                trigger={
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      formik.setValues({
                                        ...formik.values,
                                        ...row,
                                        action: "view",
                                        open: true,
                                      } as any)
                                    }
                                  >
                                    <IconEdit />
                                  </Button>
                                }
                                content="Edit"
                              />
                              <CustomTooltip
                                trigger={
                                  <Button
                                    variant="outline"
                                    size="icon"
                                    onClick={() =>
                                      setAlertState({
                                        open: true,
                                        title: "Delete Item",
                                        description:
                                          "Are you sure you want to delete this item?",
                                        cancelText: "Cancel",
                                        confirmText: "Delete",
                                        type: "danger",
                                        onConfirm: async () => {
                                          try {
                                            await deleteMutation.mutateAsync(
                                              row.id
                                            );
                                            setAlertState((p) => ({
                                              ...p,
                                              open: false,
                                            }));
                                          } catch {
                                            // handled by onError
                                          }
                                        },
                                        onClose: () =>
                                          setAlertState((p) => ({
                                            ...p,
                                            open: false,
                                          })),
                                      })
                                    }
                                  >
                                    <IconTrash />
                                  </Button>
                                }
                                content="Delete"
                              />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  <CustomPagination
                    page={Number(filter.page)}
                    setPage={(page) => setFilter({ ...filter, page })}
                    totalPages={Math.ceil(
                      itemsData.count / Number(filter.rowsPerPage)
                    )}
                    rowsPerPage={filter.rowsPerPage}
                    setRowsPerPage={(value) =>
                      setFilter((p) => ({
                        ...p,
                        rowsPerPage: value,
                        page: "1",
                      }))
                    }
                    count={itemsData.count}
                    paginationOptioins={["10", "20", "50", "100"]}
                  />
                </>
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="text-muted-foreground py-8 text-center"
                  >
                    No items found
                  </TableCell>
                </TableRow>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alert confirmation modal */}
      <AlertModal {...alertState} />

      {/* Add / Edit Dialog */}
      <Dialog open={formik.values.open} onOpenChange={() => formik.resetForm()}>
        <form onSubmit={formik.handleSubmit} className="space-y-4">
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {formik.values.action === "create" ? "Add Item" : "Update Item"}
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                name="name"
                placeholder="Name"
                value={formik.values.name}
                onChange={formik.handleChange}
                onBlur={formik.handleBlur}
                error={Boolean(formik.touched.name && formik.errors.name)}
                helperText={formik.errors.name as string}
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => formik.resetForm()}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={
                  isLoading ||
                  formik.isSubmitting ||
                  addMutation.isPending ||
                  updateMutation.isPending
                }
                onClick={() => formik.handleSubmit()}
              >
                {formik.values.action === "create" ? "Add Item" : "Update Item"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </form>
      </Dialog>
    </div>
  );
};
```
