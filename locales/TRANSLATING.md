# Translating CF Football Bypass

Want to see CF Football Bypass in your language? Contributions are welcome!

## How to add a new language

1. Copy `en.json` to a new file named `<code>.json` (e.g. `fr.json`, `de.json`, `pt.json`)
2. Translate all values (keep the keys in English)
3. Update the `_meta` section with your language info
4. Submit a Pull Request

## Rules

- **Never change the keys** — only translate the values
- Keep `{variables}` as-is (e.g. `{count}`, `{min}`, `{version}`)
- Technical terms like `DNS`, `API`, `TOTP`, `Cloudflare`, `proxy` can stay in English
- Keep it concise — UI space is limited

## `_meta` fields

```json
{
  "_meta": {
    "name": "Your Language Name",
    "code": "xx",
    "author": "Your Name or GitHub username",
    "version": "3.0.0"
  }
}
```

## Currently available

| Code | Language | Author |
|------|----------|--------|
| `es` | Español | SurMod |
| `en` | English | SurMod |

## Testing

Place your file in `locales/` and change the language in Settings or set `CFB_LANGUAGE=xx` in your environment.

---

Thank you for helping make CF Football Bypass accessible to everyone!
