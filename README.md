This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

## Note: OPFS limitations

Folio uses **OPFS (Origin Private File System)** as the primary storage for the markdown vault. OPFS is a private file system the browser grants to each origin. Keep these limitations in mind:

- **Easy to lose when browser data is cleared.** The vault lives inside the browser's storage area, so clearing "site data / browsing data" permanently deletes every file. Back up the vault (export zip) regularly.
- **No sync across browsers or devices.** Notes saved in Chrome won't appear in Firefox, Safari, or on another machine. Each origin on each browser has its own isolated OPFS area.
- **Hidden from the user.** OPFS does not show up in Finder/Explorer like normal files, so it can't be backed up or edited directly with external tools. All access goes through the app.
- **Subject to browser quota.** Capacity is limited by the quota granted to the origin and may be evicted by the browser when disk space runs low. Check via `navigator.storage.estimate()` and consider requesting persistent storage (`navigator.storage.persist()`).
- **Not durable in private/incognito mode.** OPFS data in a private window is typically wiped when the session closes.
- **Different from the File System Access API.** OPFS is automatic and requires no permission prompt, but it is isolated and hidden. If you want data to be visible and backable on the real disk, consider also using the File System Access API (`showDirectoryPicker`) to sync to a user-chosen folder.

**Recommendation:** treat OPFS as working storage, not the only copy. Always provide a backup/export mechanism and remind users to back up periodically.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
