#!/bin/bash

# This script creates GitHub releases for your previous versions
# You'll need a GitHub token with repo scope
# Run this once to backfill your releases

GITHUB_TOKEN=$(cat .env | grep GITHUB_TOKEN | cut -d '=' -f2)
REPO="pi22by7/Code-Cartographer"

# Array of past versions to create
declare -A VERSIONS
VERSIONS["0.1.0"]="Initial release"
# Skip 0.2.1 if you already have this tag/release
# VERSIONS["0.2.1"]="Bug fixes and improvements" 
VERSIONS["0.3.0"]="Configuration file support and interactive UI"
VERSIONS["0.4.0"]="Manual File Selection Mode and enhanced path handling"

# Make sure we're on the main branch
git checkout main
git pull origin main

for VERSION in "${!VERSIONS[@]}"; do
  DESCRIPTION="${VERSIONS[$VERSION]}"
  
  echo "Creating release for v$VERSION..."
  
  # Check if VSIX exists for this version
  VSIX_FILE="code-cartographer-$VERSION.vsix"
  if [ ! -f "$VSIX_FILE" ]; then
    echo "VSIX file $VSIX_FILE not found. Skipping."
    continue
  fi
  
  # Check if tag already exists
  if git rev-parse "v$VERSION" >/dev/null 2>&1; then
    echo "Tag v$VERSION already exists, using existing tag"
  else
    echo "Creating new tag v$VERSION"
    # Create a lightweight tag from the current HEAD
    # You might want to create the tag from a specific commit if you know it
    git tag "v$VERSION"
    git push origin "v$VERSION"
  fi
  
  # Check if release already exists
  RELEASE_EXISTS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/tags/v$VERSION" | grep -c "\"tag_name\": \"v$VERSION\"" || true)
  
  if [ "$RELEASE_EXISTS" -gt 0 ]; then
    echo "Release for v$VERSION already exists. Skipping release creation."
    # Get the release ID
    RELEASE_ID=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
      "https://api.github.com/repos/$REPO/releases/tags/v$VERSION" | grep -o '"id": [0-9]*' | head -1 | sed 's/"id": //')
  else
    # Create GitHub release
    echo "Creating GitHub release for v$VERSION"
    RELEASE_RESPONSE=$(curl \
      -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Accept: application/vnd.github.v3+json" \
      "https://api.github.com/repos/$REPO/releases" \
      -d "{\"tag_name\":\"v$VERSION\",\"name\":\"Release v$VERSION\",\"body\":\"$DESCRIPTION\n\nSee [CHANGELOG.md](https://github.com/$REPO/blob/main/CHANGELOG.md) for details.\",\"draft\":false,\"prerelease\":false}")
      
    # Get the release ID
    RELEASE_ID=$(echo "$RELEASE_RESPONSE" | grep -o '"id": [0-9]*' | head -1 | sed 's/"id": //')
  fi
  
  # Check if VSIX is already uploaded
  ASSETS=$(curl -s -H "Authorization: token $GITHUB_TOKEN" \
    "https://api.github.com/repos/$REPO/releases/$RELEASE_ID/assets")
  ASSET_EXISTS=$(echo "$ASSETS" | grep -c "\"name\": \"$VSIX_FILE\"" || true)
  
  if [ "$ASSET_EXISTS" -gt 0 ]; then
    echo "VSIX file $VSIX_FILE already uploaded. Skipping upload."
  else
    # Upload the VSIX file
    echo "Uploading $VSIX_FILE to release v$VERSION"
    curl \
      -X POST \
      -H "Authorization: token $GITHUB_TOKEN" \
      -H "Content-Type: application/octet-stream" \
      --data-binary @"$VSIX_FILE" \
      "https://uploads.github.com/repos/$REPO/releases/$RELEASE_ID/assets?name=$VSIX_FILE"
  fi
  
  echo "Completed processing for v$VERSION"
done

echo "All done! Check your GitHub releases page."