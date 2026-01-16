const FACEBOOK_API_TOKEN = import.meta.env.FACEBOOK_API_TOKEN;

export interface InstagramMedia {
    id: string;
    caption?: string;
    media_type: string;
    media_url: string;
    permalink: string;
    thumbnail_url?: string;
}

export async function getLatestReels(limit: number = 4): Promise<InstagramMedia[]> {
    if (!FACEBOOK_API_TOKEN) {
        console.warn("FACEBOOK_API_TOKEN is not defined in .env");
        return [];
    }

    try {
        // 1. Get the Instagram Business Account ID associated with the token
        // Note: This assumes the token is for a Facebook Page that has an Instagram Business Account linked.
        const accountResponse = await fetch(
            `https://graph.facebook.com/v18.0/me?fields=instagram_business_account&access_token=${FACEBOOK_API_TOKEN}`
        );
        const accountData = await accountResponse.json();

        if (!accountData.instagram_business_account) {
            console.warn("No Instagram Business Account found for this token.");
            return [];
        }

        const instagramId = accountData.instagram_business_account.id;

        // 2. Fetch media from that account
        const mediaResponse = await fetch(
            `https://graph.facebook.com/v18.0/${instagramId}/media?fields=id,caption,media_type,media_url,permalink,thumbnail_url&access_token=${FACEBOOK_API_TOKEN}`
        );
        const mediaData = await mediaResponse.json();

        if (!mediaData.data) {
            console.warn("No media data returned from Instagram API:", mediaData);
            return [];
        }

        // 3. Filter for videos/reels and limit the result
        return mediaData.data
            .filter((item: InstagramMedia) => item.media_type === "VIDEO")
            .slice(0, limit);
    } catch (error) {
        console.error("Error fetching Instagram reels:", error);
        return [];
    }
}
