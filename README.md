# astwerk

[![CI](https://github.com/tinas/astwerk/actions/workflows/ci.yml/badge.svg)](https://github.com/tinas/astwerk/actions/workflows/ci.yml)
[![License](https://img.shields.io/github/license/tinas/astwerk)](LICENSE)

A filter query language for TypeScript, inspired by GitHub search. People type a filter such as `is:open label:bug,ui amount:10..40`, or pick one from menus that write the same text. astwerk parses that text into a syntax tree for editors, binds it to your schema as a typed query for filter panels and backends, and writes every filter back in one canonical form, so a filter fits in a URL as a link anyone can open. It has no dependencies and runs wherever JavaScript runs, in the browser and on the server.

**[Read the documentation](packages/astwerk/README.md)**

## Contributing

Questions, bug reports, and pull requests are welcome. [CONTRIBUTING.md](CONTRIBUTING.md) explains how to set up the repository and what a pull request needs.

## License

[MIT](LICENSE)
