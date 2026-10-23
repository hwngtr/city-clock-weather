.PHONY: check test verify package clean

check:
	npm run check

test:
	npm test

verify: check
	bash scripts/verify-installed.sh

package: check
	bash scripts/package.sh

clean:
	rm -rf dist
