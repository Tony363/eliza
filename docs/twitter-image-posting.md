# Twitter Automated Image Posting

This document describes how to configure the automated image posting functionality for Twitter.

## Configuration Options

Add the following variables to your `.env` file:

```
# Enable automated image posting to Twitter
ENABLE_SCHEDULED_IMAGES=true

# Time intervals for automated image posts (in minutes)
# Minimum time between posts (defaults to 120 minutes if not set)
IMAGE_POST_INTERVAL_MIN=120

# Maximum time between posts (defaults to 240 minutes if not set)
# The actual interval will be a random value between min and max
IMAGE_POST_INTERVAL_MAX=240

# Twitter credentials (required for posting)
TWITTER_USERNAME=your_twitter_username
TWITTER_PASSWORD=your_twitter_password
TWITTER_EMAIL=your_email@example.com
TWITTER_2FA_SECRET=optional_2fa_secret

# Enable image posting (set to false to disable all image posting)
ENABLE_IMAGE_POSTING=true
```

## How It Works

The system will:

1. Generate an AI image prompt appropriate for your character
2. Generate an image using the configured image generation service
3. Save the image locally in the `agent/generatedImages` directory
4. Generate a tweet text to accompany the image
5. Post the tweet with the image to Twitter

Images will be posted at random intervals between `IMAGE_POST_INTERVAL_MIN` and `IMAGE_POST_INTERVAL_MAX` minutes.

## Troubleshooting

If images are not posting to Twitter:

1. Check that `ENABLE_SCHEDULED_IMAGES` is set to `true`
2. Verify that `ENABLE_IMAGE_POSTING` is set to `true`
3. Ensure your Twitter credentials are correctly configured
4. Check the logs for any error messages related to image generation or posting
