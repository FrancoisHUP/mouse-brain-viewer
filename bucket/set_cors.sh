gcloud storage buckets update gs://sbh-assistant-data --cors-file=bucket/cors.json

curl -X GET \
  -H "Authorization: Bearer $(gcloud auth print-access-token)" \
  "https://storage.googleapis.com/storage/v1/b/sbh-assistant-data?fields=cors"