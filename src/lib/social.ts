const FACEBOOK_API_TOKEN = import.meta.env.FACEBOOK_API_TOKEN;

export interface FacebookVideo {
    id: string;
    description?: string;
    permalink_url: string;
    picture: string; // Thumbnail
}

export async function getLatestFacebookReels(limit: number = 4): Promise<FacebookVideo[]> {
    if (!FACEBOOK_API_TOKEN) {
        console.warn("FACEBOOK_API_TOKEN is not defined in .env");
        return [];
    }

    try {
        // Fetch videos from the Page (assuming the token is a Page Access Token or has relevant permissions)
        // The 'videos' edge includes reels.
        const response = await fetch(
            `https://graph.facebook.com/v18.0/me/videos?fields=id,description,permalink_url,picture&limit=10&access_token=${FACEBOOK_API_TOKEN}`
        );
        const data = await response.json();

        if (!data.data) {
            console.warn("No video data returned from Facebook API:", data);
            return [];
        }

        // Return the latest videos/reels
        return data.data.slice(0, limit);
    } catch (error) {
        console.error("Error fetching Facebook videos:", error);
        return [];
    }
}
