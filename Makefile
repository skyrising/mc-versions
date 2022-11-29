MC_VERSIONS_DOWNLOADS = /mnt/data/minecraft/mc-versions/downloads/
URL_BASE = https://skyrising.github.io/mc-versions/

.PHONY: update
update:
	MC_VERSIONS_DOWNLOADS=$(MC_VERSIONS_DOWNLOADS) deno run --unstable --allow-env --allow-read --allow-write --allow-net --allow-run -q update.ts

.PHONY: clean
clean:
	rm -rf dist

dist:
	URL_BASE=$(URL_BASE) ./publish.tsx