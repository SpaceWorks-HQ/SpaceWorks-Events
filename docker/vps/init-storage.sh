#!/bin/sh
set -eu
mc mb --ignore-existing local/spaceworks-events
mc anonymous set none local/spaceworks-events
mc version enable local/spaceworks-events
# A separate application identity can operate only on the private app bucket.
mc admin user add local swevents-app "$S3_APP_PASSWORD" >/dev/null
mc admin policy create local swevents-app /bootstrap/storage-policy.json >/dev/null
mc admin policy attach local swevents-app --user swevents-app >/dev/null
echo 'Private storage bucket and application policy ready.'
