package datex2

import (
	"encoding/xml"
	"io"
)

type Segment struct {
	ID        string
	Road      string
	Province  string
	Direction string
	LengthM   float64
	PKStart   float64
	PKEnd     float64
	FromLat   float64
	FromLon   float64
	ToLat     float64
	ToLon     float64
	GeoJSON   string
}

type payload struct {
	Locations []predefinedLocation `xml:"predefinedLocationReference"`
}

type predefinedLocation struct {
	ID       string   `xml:"id,attr"`
	Version  string   `xml:"version,attr"`
	Location location `xml:"location"`
}

type location struct {
	LengthAffected float64      `xml:"supplementaryPositionalDescription>lengthAffected"`
	Direction      string       `xml:"tpegLinearLocation>tpegDirection"`
	To             tpegJunction `xml:"tpegLinearLocation>to"`
	From           tpegJunction `xml:"tpegLinearLocation>from"`
	Province       string       `xml:"linearWithinLinearElement>administrativeAreaOfLinearSection>values>value"`
	Road           string       `xml:"linearWithinLinearElement>linearElement>roadName>values>value"`
	PKStart        float64      `xml:"linearWithinLinearElement>fromPoint>distanceAlong"`
	PKEnd          float64      `xml:"linearWithinLinearElement>toPoint>distanceAlong"`
}

type tpegJunction struct {
	Lat float64 `xml:"pointCoordinates>latitude"`
	Lon float64 `xml:"pointCoordinates>longitude"`
}

func Parse(r io.Reader) ([]Segment, error) {
	var p payload
	if err := xml.NewDecoder(r).Decode(&p); err != nil {
		return nil, err
	}

	segments := make([]Segment, 0, len(p.Locations))
	for _, loc := range p.Locations {
		if loc.Location.From.Lat == 0 || loc.Location.From.Lon == 0 ||
			loc.Location.To.Lat == 0 || loc.Location.To.Lon == 0 {
			continue
		}
		segments = append(segments, Segment{
			ID:        loc.ID,
			Road:      loc.Location.Road,
			Province:  loc.Location.Province,
			Direction: loc.Location.Direction,
			LengthM:   loc.Location.LengthAffected,
			PKStart:   loc.Location.PKStart,
			PKEnd:     loc.Location.PKEnd,
			FromLat:   loc.Location.From.Lat,
			FromLon:   loc.Location.From.Lon,
			ToLat:     loc.Location.To.Lat,
			ToLon:     loc.Location.To.Lon,
		})
	}

	return segments, nil
}
