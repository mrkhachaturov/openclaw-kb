# openclaw-kb development recipes

# Install dependencies
setup:
    npm install

# Reindex the knowledge base
index *ARGS:
    node scripts/index.js {{ARGS}}

# Query the knowledge base
query *ARGS:
    node scripts/query.js {{ARGS}}

# Run CLI directly
cli *ARGS:
    node bin/cli.js {{ARGS}}
