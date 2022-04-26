MC_VERSIONS_DOWNLOADS = /mnt/data/minecraft/mc-versions/downloads/
JAVAC = $(shell realpath $(shell which javac))
JAVA_HOME ?= $(JAVAC:%/bin/javac=%)
URL_BASE = https://skyrising.github.io/mc-versions/

.PHONY: update
update:
ifeq ($(GITHUB_ACTIONS),true)
	@echo '::group::Build jar-analyzer'
endif
	cd jar-analyzer && JAVA_HOME=$(JAVA_HOME) ./gradlew build
ifeq ($(GITHUB_ACTIONS),true)
	@echo '::endgroup::'
endif
	JAVA_HOME=$(JAVA_HOME) MC_VERSIONS_DOWNLOADS=$(MC_VERSIONS_DOWNLOADS) deno run --unstable --allow-env --allow-read --allow-write --allow-net --allow-run -q update.ts

.PHONY: clean
clean:
	rm -rf dist

dist:
	URL_BASE=$(URL_BASE) ./publish.tsx