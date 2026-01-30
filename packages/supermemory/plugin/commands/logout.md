---
description: Clear Supermemory credentials and disconnect
---

# Logout from Supermemory

Clear saved Supermemory credentials and settings.

## Steps

1. Remove the settings file:

```bash
rm -rf ~/.supermemory-claude
```

2. Remind the user to unset the environment variable if needed:

```
To fully disconnect, also unset the environment variable:
unset SUPERMEMORY_CC_API_KEY
```

3. Confirm logout was successful.
