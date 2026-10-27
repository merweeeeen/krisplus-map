# Kris+ outlet data quality report

Generated 2026-10-27T09:47:40.299+08:00 from crawl `20261026-172441`, which ran from 2026-10-26T17:24:41.167+08:00 to 2026-10-26T17:35:29.293+08:00.

The crawl is **complete**. Every URL in the partner sitemap was fetched or answered 404.

## Partner coverage

| Item | Count |
| --- | --- |
| URLs in the partner sitemap | 646 |
| Pages fetched | 641 |
| Pages that answered 404 | 5 |
| Pages that failed | 0 |
| Pages parsed | 641 |
| Pages that failed to parse | 0 |

The sitemap lists these pages, but they answered 404:

- https://www.krisplus.com/en/sg/partners/details/dbs-06d13c93
- https://www.krisplus.com/en/sg/partners/details/uob-834514e6
- https://www.krisplus.com/en/sg/partners/details/capitastar-a99ea149
- https://www.krisplus.com/en/sg/partners/details/pan-pacific-hotels-group-singapore-97258576
- https://www.krisplus.com/en/sg/partners/details/kfp-d2e2eb9c

## Outlets

| Outlet type | Records |
| --- | --- |
| physical | 1767 |
| online | 23 |
| unknown | 12 |

1802 records in `krisplus-outlets.json`. 1552 of them are map features in `krisplus-outlets.geojson`. Online merchants and partners that list no outlet get no map feature.

## Geocoding

| Geocode status | Physical outlets |
| --- | --- |
| matched | 1552 |
| needs_review | 208 |
| missing | 7 |

| Coordinate source | Physical outlets |
| --- | --- |
| onemap | 1552 |

Every coordinate has building precision at best. Kris+ publishes outlet names, not addresses, so the pipeline finds the building and cannot place a shop inside it. Outlets in one mall share coordinates.

208 physical outlets need review and have no coordinates. `needs-review.csv` lists each one with the query and the top OneMap candidates. The reasons:

| Reason | Outlets |
| --- | --- |
| building query: matching results lie more than 250 m apart | 78 |
| merchant_street query: OneMap returned no results; merchant_on_street query: OneMap returned no results | 50 |
| building query: OneMap returned no results | 42 |
| building query: OneMap also lists the name as a road, station, or area, and no building has exactly that name | 10 |
| merchant_street query: OneMap returned no results; merchant_on_street query: no result matched the name | 9 |
| building query: no matching result has a street address | 6 |
| building query: no result matched the name | 5 |
| address query: no result matched the name; building query: no result matched the name | 3 |
| No outlet name to search for | 2 |
| address query: matching results lie more than 250 m apart; building query: matching results lie more than 250 m apart | 1 |
| address query: OneMap returned no results; building query: OneMap returned no results | 1 |
| merchant_street query: matching results lie more than 250 m apart; merchant_on_street query: no result matched the name | 1 |

## Validation

Every record passed the validation rules.

## Identity

Every outlet keeps the Kris+ outlet `_id`, so a rerun cannot duplicate it.

| Check | Count |
| --- | --- |
| One merchant lists two outlets with the same name | 2 |
| An outlet changed its name since an earlier crawl | 0 |
| The registry knows an outlet that this crawl did not see | 0 |

Same-name outlets keep separate records, because Kris+ gives them separate IDs:

- SIN MING AUTOCARE: `692fa12cf98f0bf71829bf61`, `6a714c9c06f15c18bea95bc7`
- PARKROYAL on Beach Road: `608ba03245ba573ee44dabec`, `6944d2d3d7d191631eb1b3bc`

## Outlet counts that disagree

The partner payload states an outlet count in `applicableCities[0].outletsCount`. 76 of 594 partners state a count that differs from the outlets they list. The exports follow the listed outlets, because those carry IDs and match the page.

| Partner | Listed | Stated |
| --- | --- | --- |
| aburi-en-2257e394 | 10 | 9 |
| affordable-wines-d28da795 | 0 | 1 |
| aibi-44c70d38 | 3 | 4 |
| amici-events-and-catering-ef5b7b14 | 0 | 1 |
| anglo-indian-cafe-bar-67cae762 | 3 | 2 |
| avocadoria-singapore-fbf6ab65 | 4 | 5 |
| bacha-coffee-98f2c56e | 11 | 8 |
| bada-hair-341c9365 | 0 | 1 |
| bee-cheng-hiang-cef63516 | 37 | 38 |
| better-vision-6ca5067d | 6 | 7 |
| birkenstock-7e11dc86 | 5 | 4 |
| bottles-bottles-009fdcdf | 10 | 6 |
| bratpack-c590818d | 2 | 3 |
| breitling-267fd057 | 2 | 1 |
| bublotte-f1a2b25f | 0 | 1 |
| canadian-pizza-a423dc6b | 12 | 14 |
| capitol-optical-84989321 | 17 | 3 |
| cars-d9c68fe2 | 18 | 14 |
| cedele-c29df4a7 | 22 | 23 |
| challenger-3e965393 | 35 | 30 |
| coca-c54787ec | 1 | 2 |
| coucou-hotpot-brew-tea-7f46e435 | 2 | 3 |
| douraku-sushi-8bee7307 | 1 | 2 |
| five-guys-0262ab78 | 1 | 2 |
| flippers-c8d30b7d | 2 | 3 |
| floramoments-d767687c | 0 | 1 |
| flower-chimp-1f471d82 | 0 | 1 |
| georges-3fa6392f | 7 | 6 |
| hipvan-99c2399f | 0 | 1 |
| hupfarri-72d277e4 | 2 | 3 |
| in-good-company-cdc08fce | 1 | 2 |
| joyre-tcmedi-spa-e64f6623 | 11 | 10 |
| jumbo-seafood-80c1fffe | 5 | 6 |
| kenko-wellness-spa-reflexology-92f4340c | 3 | 2 |
| kin-kao-mai-thai-restaurant-acdd25f0 | 2 | 3 |
| klarra-e0b79dc8 | 2 | 1 |
| krispy-kreme-60b20b67 | 15 | 12 |
| krisshop-549d7aae | 0 | 1 |
| laundryheap-72b80fb3 | 0 | 1 |
| leading-holiday-47949e3a | 0 | 1 |
| les-bouchons-708cf483 | 3 | 1 |
| lifespa-dbf08e28 | 3 | 2 |
| llaollao-3073034a | 13 | 10 |
| lvly-cb3ce3e4 | 0 | 1 |
| mayer-a7243165 | 9 | 5 |
| menya-kokoro-148e487d | 3 | 1 |
| mrs-pho-69409725 | 1 | 2 |
| nan-yang-dao-d56c969b | 16 | 17 |
| paradise-dynasty-c85a8079 | 6 | 7 |
| paradise-teochew-fe44d4fb | 1 | 2 |
| paris-baguette-51340d89 | 29 | 26 |
| parisilk-9c3880ef | 3 | 4 |
| pedro-438b3d79 | 12 | 14 |
| pelago-6b9b1f0d | 0 | 1 |
| phs-hairscience-af7864a0 | 3 | 1 |
| polar-puffs-cakes-30180552 | 38 | 14 |
| ryde-6e9c690d | 0 | 1 |
| seafood-paradise-760f1d5d | 2 | 3 |
| seoul-garden-buffet-cca1ba31 | 7 | 8 |
| seoul-garden-hotpot-a60d1c0c | 3 | 4 |
| shunji-matsuo-d16c3a01 | 3 | 1 |
| si-chuan-dou-hua-55c97409 | 3 | 1 |
| singapore-airlines-academy-87391c52 | 0 | 1 |
| solvil-et-titus-b227949e | 1 | 2 |
| sunnystep-7916bfa6 | 11 | 13 |
| tenya-singapore-b916bfaa | 2 | 3 |
| the-1872-clipper-tea-co-d9f9d1f0 | 3 | 2 |
| the-honey-colony-8761309a | 0 | 1 |
| the-straits-wine-company-190cfdff | 3 | 4 |
| the-white-tiffin-c1038188 | 5 | 6 |
| tsuta-japanese-dining-27f953d2 | 2 | 1 |
| tung-lok-seafood-67cbb07f | 4 | 5 |
| twg-tea-b52e2890 | 11 | 4 |
| vincent-watch-5face02a | 4 | 5 |
| weddings-by-grain-00547d41 | 0 | 1 |
| workspace-grains-and-cafe-b14c805b | 2 | 1 |

## Known limits

- Kris+ publishes no outlet address, postal code, opening hours, or phone number. Those fields are `null`. Location fields from OneMap carry the `geocode_` prefix.
- `promotions` is `null` for every outlet. Promotions were not collected in this run.
- The earn rate is the standard rate from the partner page. A promotion may raise it for a time. This run did not check promotion pages.
- 3 partners have earning switched off. Their rate is 0, with a note in `participation_notes`.
