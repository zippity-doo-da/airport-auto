# Airport data sources and import policy

Airport Auto is an entertainment simulation. Imported airport data is compiled into local, versioned assets for visual and operational reference only. It is not current navigation data and must not be used for flight planning, taxiing, or any real-world aviation purpose.

## Source policy

Every generated airport asset must record:

- the provider, dataset title, item or download identifier, and source URL;
- the provider's license or public-use statement and required attribution;
- the retrieval date and source modification/effective dates;
- the source coordinate reference system, local projection, origin, axes, and units;
- the importer and airport-asset schema versions;
- feature counts and a content checksum.

The shipped simulation never requires a live map service. Network access is an explicit developer-side import step, and generated assets are reviewed and committed like source code.

## O'Hare airfield geometry

The first high-fidelity airport target is Chicago O'Hare (`KORD`). Its airfield geometry comes from the FAA Aeronautical Data Delivery Service Airport Mapping feature services owned by `AeronauticalInformationServices_FAA`.

The FAA item metadata describes the data as public-use reference/sample data, attributes it to the Federal Aviation Administration, and states that the airport-mapping features are captured from imagery and verified against official sources. The importer currently consumes these WGS 84 (`EPSG:4326`) layers:

| Layer | ArcGIS item | Feature service |
| --- | --- | --- |
| Runway | `bc80e5ca97804c2fbc0c10482377adf5` | `AM_Runway` |
| Taxiway | `d1c02f9f3f7144af8ead3aca44961c59` | `AM_Taxiway` |
| Apron | `e74412cf6a2345eb9974fa21b6faa225` | `AM_Apron` |
| Building | `7bca2c0cf31f43b89601433eda009312` | `AM_Building` |
| Hot spot | `d1474c9456b9485f94cecce10a47944c` | `AM_Hotspot` |
| Stopway | `b18e9298866749f4878ea1f42e5be98d` | `AM_Stopway` |
| Beacon | `4b277ecb5aed4bcd808c95c67dc1a423` | `AM_Beacon` |
| Wind indicator | `faf33e0cb5ed46fdafe09bdf455c48f2` | `AM_Wind_Indicator` |

Item metadata is available from `https://www.arcgis.com/sharing/rest/content/items/{item-id}?f=json`. Feature data is queried from `https://services6.arcgis.com/ssFJjBXIUyZDrSYZ/arcgis/rest/services/{service}/FeatureServer/0` with an `ICAO_ID` filter.

FAA attribution used in the game and asset manifest:

> Federal Aviation Administration, Air Traffic Organization, Mission Support Services, Aeronautical Information Services.

The current committed asset records its own effective window. Reimporting against a later FAA cycle is an intentional data update and must pass the same validation and visual review as a code change.

## O'Hare surface centerlines and airport surroundings

O'Hare taxiway, taxilane, and runway centerlines use OpenStreetMap data obtained through a bounded, saved Overpass query. The resulting ODbL asset is kept separate from FAA airfield geometry. The importer converts shared OSM nodes into a routable graph, removes building conflicts, maps geometric runway crossings to protected FAA runway IDs, and records every deliberately excluded way or segment.

Roads, land use, rail, and water around named airports will use the same bounded-query policy in a future context asset; they are not part of the current surface graph.

OpenStreetMap data is licensed under the Open Data Commons Open Database License 1.0. Any shipped context asset must:

- display `© OpenStreetMap contributors` with a link to `https://www.openstreetmap.org/copyright`;
- retain the exact query/bounds, retrieval date, and source URL in its manifest;
- make the derived context database available under the ODbL when distribution triggers share-alike;
- avoid copying OpenStreetMap's cartographic style, tiles, or visual assets.

The OSM surface asset, exact query, ODbL notice, and attribution are shipped with the game. The surrounding Chicago landscape remains procedural until a separately versioned context importer and layer controls are complete. ORD remains labeled `ATC schematic` until the full milestone acceptance gate passes.

## Coordinate conversion

The FAA importer reads WGS 84 longitude/latitude and computes a local tangent-plane approximation centered on the bounds of the airport's runway polygons:

- positive `x`: east;
- positive `y`: north;
- unit: metre;
- Earth radius: WGS 84 semi-major axis, 6,378,137 metres.

Coordinates are rounded to 0.1 metre in the generated asset. Runtime conversion to Airport Auto world units uses the simulation's declared metres-per-unit value; the source asset itself stays in metres so physical size and future reprojection remain auditable.

## Import and validation

To refresh the committed KORD asset with an explicit retrieval date:

```bash
npm run import:ord
npm run test:airport-data
```

`import:ord` refreshes FAA data and deterministically rebuilds the graph from the committed OSM source asset. `import:ord:refresh` deliberately contacts Overpass to update that source asset; review its timestamp, query, geometry diff, exclusions, and ODbL metadata before committing.

The validator rejects missing provenance, duplicate or unsorted feature IDs, unexpected geometry, non-finite coordinates, open or degenerate polygon rings, out-of-bounds features, incorrect layer counts, and asset/manifest checksum drift. Surface-graph validation is a separate acceptance gate: raw pavement polygons are not treated as safe routable centerlines until topology generation and clearance checks pass.
