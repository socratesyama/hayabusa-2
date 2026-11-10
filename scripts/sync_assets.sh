#!/usr/bin/env bash
# Copy static assets from the dataset dirs into site/public/assets and site/public/data (never copies tgz/tif/raw data).
set -euo pipefail
R="$(cd "$(dirname "$0")/.." && pwd)"; A="$R/site/public/assets"; D="$R/site/public/data"
mkdir -p "$A" "$D/edu" "$A/shape" "$A/gallery"
cp -r "$R/12_site_data/generated/." "$A/generated/" 2>/dev/null || { mkdir -p "$A/generated"; cp -r "$R/12_site_data/generated/." "$A/generated/"; }
for f in poi_master event_asset_links image_location_map samples_metadata features; do cp "$R/12_site_data/$f.json" "$D/"; done
cp "$R/12_site_data/education/"*.json "$D/edu/"
cp "$R/12_site_data/provenance/source_registry.csv" "$R/12_site_data/provenance/license_registry.json" "$D/"
cp "$R/06_timeline_text/timeline.json" "$R/06_timeline_text/ryugu_surface_points.json" "$D/"
cp "$R/12_site_data/education/age_tier_guide.md" "$D/edu/"
cp "$R/01_shape_models/"*49k*web.obj "$R/01_shape_models/"*sfm_50k*web.obj "$A/shape/" 2>/dev/null || true
cp "$R/10_pointclouds/sfm_3m/"*316k*web.ply "$A/shape/" 2>/dev/null || true
cp "$R/11_spacecraft_model/hayabusa2_spacecraft.glb" "$A/"
# gallery: copy jpgs lazily-loaded at runtime (keeps folder structure)
cp -r "$R/02_onc_images/official_gallery_jaxa/." "$A/gallery/"
echo "assets synced"
