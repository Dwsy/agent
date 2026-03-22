/**
 * Feishu Directory API — query users and groups.
 *
 * Provides:
 * - listFeishuDirectoryPeers (users)
 * - listFeishuDirectoryGroups (chats)
 *
 * Aligned with openclaw directory.ts
 */

import type * as Lark from "@larksuiteoapi/node-sdk";

// ============================================================================
// Types
// ============================================================================

export interface FeishuDirectoryPeer {
  kind: "user";
  id: string;
  name?: string;
  email?: string;
}

export interface FeishuDirectoryGroup {
  kind: "chat";
  id: string;
  name?: string;
  memberCount?: number;
  description?: string;
}

// ============================================================================
// Directory Queries
// ============================================================================

/**
 * List users (peers) from Feishu contacts.
 */
export async function listFeishuDirectoryPeers(
  client: Lark.Client,
  query?: string,
  limit?: number,
): Promise<FeishuDirectoryPeer[]> {
  const peers: FeishuDirectoryPeer[] = [];
  const pageSize = Math.min(limit ?? 50, 50);

  try {
    const response = await client.contact.user.list({
      params: {
        page_size: pageSize,
      },
    });

    if (response.code !== 0) {
      return peers;
    }

    for (const user of response.data?.items ?? []) {
      if (user.open_id) {
        const q = query?.trim().toLowerCase() || "";
        const name = user.name || "";
        const email = user.email || "";

        // Filter by query if provided
        if (
          !q ||
          user.open_id.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q) ||
          email.toLowerCase().includes(q)
        ) {
          peers.push({
            kind: "user",
            id: user.open_id,
            name: name || undefined,
            email: email || undefined,
          });
        }
      }

      if (peers.length >= (limit ?? 50)) {
        break;
      }
    }

    return peers;
  } catch (err) {
    // Return empty on error (permissions, etc.)
    return peers;
  }
}

/**
 * List groups (chats) from Feishu.
 */
export async function listFeishuDirectoryGroups(
  client: Lark.Client,
  query?: string,
  limit?: number,
): Promise<FeishuDirectoryGroup[]> {
  const groups: FeishuDirectoryGroup[] = [];
  const pageSize = Math.min(limit ?? 50, 50);

  try {
    const response = await client.im.chat.list({
      params: {
        page_size: pageSize,
      },
    });

    if (response.code !== 0) {
      return groups;
    }

    let items = response.data?.items ?? [];

    // Filter by query if provided
    if (query?.trim()) {
      const q = query.toLowerCase();
      items = items.filter(
        (item: any) =>
          item.name?.toLowerCase().includes(q) ||
          item.chat_id?.toLowerCase().includes(q)
      );
    }

    for (const item of items) {
      groups.push({
        kind: "chat",
        id: item.chat_id || "",
        name: item.name || undefined,
        memberCount: (item as any).member_count,
        description: item.description || undefined,
      });
    }

    return groups;
  } catch (err) {
    // Return empty on error
    return groups;
  }
}

/**
 * Search directory (both peers and groups).
 */
export async function searchFeishuDirectory(
  client: Lark.Client,
  query?: string,
  limit?: number,
): Promise<{ peers: FeishuDirectoryPeer[]; groups: FeishuDirectoryGroup[] }> {
  const [peers, groups] = await Promise.all([
    listFeishuDirectoryPeers(client, query, limit),
    listFeishuDirectoryGroups(client, query, limit),
  ]);

  return { peers, groups };
}
