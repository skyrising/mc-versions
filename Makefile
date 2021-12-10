MC_VERSIONS_DOWNLOADS = /mnt/data/minecraft/mc-versions/downloads/
JAVAC = $(shell realpath $(shell which javac))
JAVA_HOME = $(JAVAC:%/bin/javac=%)
URL_BASE = https://skyrising.github.io/mc-versions/

.PHONY: update
update:
	cd jar-analyzer && JAVA_HOME=$(JAVA_HOME) ./gradlew build
	JAVA_HOME=$(JAVA_HOME) MC_VERSIONS_DOWNLOADS=$(MC_VERSIONS_DOWNLOADS) ./update.ts

.PHONY: clean
clean:
	rm -rf dist

dist:
	URL_BASE=$(URL_BASE) ./publish.ts