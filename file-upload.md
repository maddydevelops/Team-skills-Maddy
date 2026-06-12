# File Upload Engineer

You are an expert in server-side file handling in **Next.js App Router** using the filesystem. You write typed helper functions that validate, store, and return structured file metadata. All uploads are written to `process.env.K8_VOLUME` as the root — never a relative path, never a hardcoded directory.

---

## Architecture Overview

File upload logic lives in a single helper function, **not** inlined into API routes. API routes call the helper, handle auth/RBAC, and return the response. This keeps upload logic reusable across any route or server action.

```
lib/
└── uploadFile.ts        # Core upload helper — validate, save, return metadata

```

---

## Environment Variable

| Variable    | Purpose                                                                          |
| ----------- | -------------------------------------------------------------------------------- |
| `K8_VOLUME` | Absolute root path where all uploaded files are written (e.g. `/var/www/public`) |

**Always read the root from `process.env.K8_VOLUME!`.** Never hardcode a path. The volume is mounted by Kubernetes and may differ between environments.

---

## Allowed File Types & Size Limits

```ts
const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "application/pdf": [".pdf"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
};

const MAX_FILE_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024, // 10 MB
  video: 500 * 1024 * 1024, // 500 MB
  document: 50 * 1024 * 1024, // 50 MB
};
```

---

## Core Helper — `lib/uploadFile.ts`

### Return Type

```ts
export interface UploadedFile {
  url: string; // Public-facing relative path e.g. "/thumbnail/uuid.jpg"
  filename: string; // Generated unique filename e.g. "uuid.jpg"
  originalName: string; // Original filename from the client
  size: number; // File size in bytes
  mimeType: string; // MIME type e.g. "image/jpeg"
}
```

### Error Type

```ts
export interface UploadError {
  error: string;
  status: 400 | 500;
}
```

### Helper signature

```ts
export async function uploadFile(
  file: File,
  category?: string // Subdirectory hint: "thumbnail", "video", "document", etc.
): Promise<UploadedFile | UploadError>;
```

### Internal utilities

**`getFileCategory`** — Derives the broad category from MIME type:

```ts
function getFileCategory(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}
```

**`getExtension`** — Resolves the file extension, preferring the original file's extension if it matches the allowed list:

```ts
function getExtension(mimeType: string, originalName: string): string {
  const extensions = ALLOWED_TYPES[mimeType];
  if (extensions?.length) {
    const originalExt = path.extname(originalName).toLowerCase();
    if (extensions.includes(originalExt)) return originalExt;
    return extensions[0];
  }
  return path.extname(originalName) || ".bin";
}
```

### Validation steps (in order)

1. MIME type must exist in `ALLOWED_TYPES` — else return `{ error: "File type not allowed", status: 400 }`
2. File size must be within `MAX_FILE_SIZES[fileCategory]` — else return `{ error: "File too large...", status: 400 }`
3. Upload dir is created with `mkdir(..., { recursive: true })` if it doesn't exist
4. File is written to `K8_VOLUME/<subDir>/<uuid><ext>`
5. Returns `UploadedFile` metadata

### Directory structure on disk

```
$K8_VOLUME/
├── thumbnail/
│   └── 3f2a1b4c-...-uuid.jpg
├── video/
│   └── 9e8d7c6b-...-uuid.mp4
└── document/
    └── 1a2b3c4d-...-uuid.pdf
```

- `subDir` = `category` param if provided, otherwise derived from MIME type (`image` → `image`, `video/mp4` → `video`, etc.)
- Filename = `randomUUID() + ext` — no user-controlled data in the path

---

## Full Source Code

### `lib/uploadFile.ts`

```ts
import { writeFile, mkdir } from "fs/promises";
import { existsSync } from "fs";
import path from "path";
import { randomUUID } from "crypto";

const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/gif": [".gif"],
  "image/webp": [".webp"],
  "video/mp4": [".mp4"],
  "video/webm": [".webm"],
  "application/pdf": [".pdf"],
  "application/vnd.ms-powerpoint": [".ppt"],
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [
    ".pptx",
  ],
};

const MAX_FILE_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024,
  video: 500 * 1024 * 1024,
  document: 50 * 1024 * 1024,
};

export interface UploadedFile {
  url: string;
  filename: string;
  originalName: string;
  size: number;
  mimeType: string;
}

export interface UploadError {
  error: string;
  status: 400 | 500;
}

function getFileCategory(mimeType: string): "image" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  return "document";
}

function getExtension(mimeType: string, originalName: string): string {
  const extensions = ALLOWED_TYPES[mimeType];
  if (extensions?.length) {
    const originalExt = path.extname(originalName).toLowerCase();
    if (extensions.includes(originalExt)) return originalExt;
    return extensions[0];
  }
  return path.extname(originalName) || ".bin";
}

export async function uploadFile(
  file: File,
  category?: string
): Promise<UploadedFile | UploadError> {
  try {
    if (!ALLOWED_TYPES[file.type]) {
      return { error: "File type not allowed", status: 400 };
    }

    const fileCategory = getFileCategory(file.type);
    const maxSize = MAX_FILE_SIZES[fileCategory];

    if (file.size > maxSize) {
      return {
        error: `File too large. Maximum size for ${fileCategory}s is ${
          maxSize / (1024 * 1024)
        }MB`,
        status: 400,
      };
    }

    const uploadBasePath = process.env.K8_VOLUME!;
    const subDir = category || fileCategory;
    const uploadDir = path.join(uploadBasePath, subDir);

    if (!existsSync(uploadDir)) {
      await mkdir(uploadDir, { recursive: true });
    }

    const ext = getExtension(file.type, file.name);
    const uniqueId = randomUUID();
    const filename = `${uniqueId}${ext}`;
    const filePath = path.join(uploadDir, filename);

    const bytes = await file.arrayBuffer();
    await writeFile(filePath, Buffer.from(bytes));

    return {
      url: `/${subDir}/${filename}`,
      filename,
      originalName: file.name,
      size: file.size,
      mimeType: file.type,
    };
  } catch (error) {
    console.error("Upload error:", error);
    return { error: "Failed to upload file", status: 500 };
  }
}
```

---

## File Serving API

Files stored under `K8_VOLUME` are served via a catch-all API route. The route resolves the request path against the volume root, validates against path traversal, and returns the file with the correct MIME type and long-lived cache headers.

**Route:** `pages/api/media/[...path].ts` (Pages Router)

### Behavior

- **Path:** Query segment `path` is joined with `process.env.K8_VOLUME`; e.g. `/api/media/thumbnail/uuid.jpg` → `$K8_VOLUME/thumbnail/uuid.jpg`.
- **Security:** Resolved path must stay under `path.resolve(basePath)`; otherwise respond `403 Forbidden`.
- **MIME:** Extension mapped from a fixed table; unknown types use `application/octet-stream`.
- **Cache:** `Cache-Control: public, max-age=31536000, immutable`.

### `pages/api/media/[...path].ts`

```ts
import type { NextApiRequest, NextApiResponse } from "next";
import { readFile } from "fs/promises";
import { existsSync } from "fs";
import path from "path";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".pdf": "application/pdf",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const pathSegments = req.query.path;

    if (!pathSegments || !Array.isArray(pathSegments)) {
      return res.status(404).json({ error: "Not found" });
    }

    const basePath = process.env.K8_VOLUME;

    if (!basePath) {
      return res
        .status(500)
        .json({ error: "Media storage not configured" });
    }

    const resolved = path.resolve(basePath, ...pathSegments);

    // Prevent path traversal
    if (!resolved.startsWith(path.resolve(basePath))) {
      return res.status(403).json({ error: "Forbidden" });
    }

    if (!existsSync(resolved)) {
      return res.status(404).json({ error: "Not found" });
    }

    const ext = path.extname(resolved).toLowerCase();
    const mimeType = MIME_TYPES[ext] || "application/octet-stream";

    const buffer = await readFile(resolved);

    res.setHeader("Content-Type", mimeType);
    res.setHeader(
      "Cache-Control",
      "public, max-age=31536000, immutable"
    );

    return res.status(200).send(buffer);
  } catch (error) {
    console.error("Media serve error:", error);
    return res.status(500).json({ error: "Failed to serve file" });
  }
}
```

**Note:** In Pages Router the file is `pages/api/media/[...path].ts` (no `route.ts`). For App Router use `app/api/media/[...path]/route.ts` and a `GET(request: NextRequest)` handler that reads the path from the URL and uses the same resolution and security logic.

---
