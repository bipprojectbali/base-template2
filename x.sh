curl https://claude-local.wibudev.com/v1/chat/completions \
  -H "Authorization: Bearer sk-ZaQFl7HwwacRWSu46z5HefCIftokbAhdCwDpHlqpoEIHfsWJ" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-sonnet-4-6",
    "messages": [{"role": "user", "content": "aku ada dimana?"}]
  }'