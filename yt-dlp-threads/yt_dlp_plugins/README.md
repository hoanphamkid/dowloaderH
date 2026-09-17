# Threads extractor

Bundled copy of the Threads extractor from [tribixbite/yt-dlp-threads](https://github.com/tribixbite/yt-dlp-threads), licensed under the Unlicense (public domain). It is loaded only from this repository's explicit yt-dlp plugin directory; no plugin is downloaded at runtime.

The extractor uses crawler-rendered metadata for publicly viewable posts because Threads does not expose their video URLs to anonymous clients. It does not use account cookies. Support may break if Threads changes its page format. The shortcode is matched exactly so unrelated recommendations are never selected.
