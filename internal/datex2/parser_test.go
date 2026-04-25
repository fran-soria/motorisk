package datex2

import (
	"strings"
	"testing"
)

const xmlValid = `<root>
  <predefinedLocationReference id="Madrid_A-3_12000" version="1">
    <location>
      <supplementaryPositionalDescription><lengthAffected>1850</lengthAffected></supplementaryPositionalDescription>
      <tpegLinearLocation>
        <tpegDirection>bothWays</tpegDirection>
        <from><pointCoordinates><latitude>40.1</latitude><longitude>-3.7</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>40.2</latitude><longitude>-3.6</longitude></pointCoordinates></to>
      </tpegLinearLocation>
      <linearWithinLinearElement>
        <administrativeAreaOfLinearSection><values><value>Madrid</value></values></administrativeAreaOfLinearSection>
        <linearElement><roadName><values><value>A-3</value></values></roadName></linearElement>
        <fromPoint><distanceAlong>12000</distanceAlong></fromPoint>
        <toPoint><distanceAlong>13850</distanceAlong></toPoint>
      </linearWithinLinearElement>
    </location>
  </predefinedLocationReference>
</root>`

// zeroFromXML has lat=0 lon=0 in both From and To → should be filtered.
const xmlZeroCoords = `<root>
  <predefinedLocationReference id="zero" version="1">
    <location>
      <tpegLinearLocation>
        <from><pointCoordinates><latitude>0</latitude><longitude>0</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>0</latitude><longitude>0</longitude></pointCoordinates></to>
      </tpegLinearLocation>
    </location>
  </predefinedLocationReference>
</root>`

// xmlPartialZero has a valid From but zero lon in To → filtered.
const xmlPartialZero = `<root>
  <predefinedLocationReference id="partial" version="1">
    <location>
      <tpegLinearLocation>
        <from><pointCoordinates><latitude>40.1</latitude><longitude>-3.7</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>40.2</latitude><longitude>0</longitude></pointCoordinates></to>
      </tpegLinearLocation>
    </location>
  </predefinedLocationReference>
</root>`

const xmlMixed = `<root>
  <predefinedLocationReference id="good" version="1">
    <location>
      <supplementaryPositionalDescription><lengthAffected>1000</lengthAffected></supplementaryPositionalDescription>
      <tpegLinearLocation>
        <tpegDirection>bothWays</tpegDirection>
        <from><pointCoordinates><latitude>42.0</latitude><longitude>-3.5</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>42.1</latitude><longitude>-3.4</longitude></pointCoordinates></to>
      </tpegLinearLocation>
      <linearWithinLinearElement>
        <administrativeAreaOfLinearSection><values><value>Burgos</value></values></administrativeAreaOfLinearSection>
        <linearElement><roadName><values><value>N-1</value></values></roadName></linearElement>
        <fromPoint><distanceAlong>1000</distanceAlong></fromPoint>
        <toPoint><distanceAlong>2000</distanceAlong></toPoint>
      </linearWithinLinearElement>
    </location>
  </predefinedLocationReference>
  <predefinedLocationReference id="bad" version="1">
    <location>
      <tpegLinearLocation>
        <from><pointCoordinates><latitude>0</latitude><longitude>0</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>0</latitude><longitude>0</longitude></pointCoordinates></to>
      </tpegLinearLocation>
    </location>
  </predefinedLocationReference>
</root>`

const xmlMultiple = `<root>
  <predefinedLocationReference id="seg1" version="1">
    <location>
      <tpegLinearLocation>
        <from><pointCoordinates><latitude>40.1</latitude><longitude>-3.7</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>40.2</latitude><longitude>-3.6</longitude></pointCoordinates></to>
      </tpegLinearLocation>
    </location>
  </predefinedLocationReference>
  <predefinedLocationReference id="seg2" version="1">
    <location>
      <tpegLinearLocation>
        <from><pointCoordinates><latitude>41.3</latitude><longitude>2.1</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>41.4</latitude><longitude>2.2</longitude></pointCoordinates></to>
      </tpegLinearLocation>
    </location>
  </predefinedLocationReference>
  <predefinedLocationReference id="seg3" version="1">
    <location>
      <tpegLinearLocation>
        <from><pointCoordinates><latitude>37.8</latitude><longitude>-4.7</longitude></pointCoordinates></from>
        <to><pointCoordinates><latitude>37.9</latitude><longitude>-4.6</longitude></pointCoordinates></to>
      </tpegLinearLocation>
    </location>
  </predefinedLocationReference>
</root>`

func TestParse_valid(t *testing.T) {
	segs, err := Parse(strings.NewReader(xmlValid))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 1 {
		t.Fatalf("expected 1 segment, got %d", len(segs))
	}
	s := segs[0]
	if s.ID != "Madrid_A-3_12000" {
		t.Errorf("ID: got %q", s.ID)
	}
	if s.Road != "A-3" {
		t.Errorf("Road: got %q", s.Road)
	}
	if s.Province != "Madrid" {
		t.Errorf("Province: got %q", s.Province)
	}
	if s.Direction != "bothWays" {
		t.Errorf("Direction: got %q", s.Direction)
	}
	if s.LengthM != 1850 {
		t.Errorf("LengthM: got %g", s.LengthM)
	}
	if s.PKStart != 12000 || s.PKEnd != 13850 {
		t.Errorf("PK: got %g–%g", s.PKStart, s.PKEnd)
	}
	if s.FromLat != 40.1 || s.FromLon != -3.7 {
		t.Errorf("From: got (%g, %g)", s.FromLat, s.FromLon)
	}
	if s.ToLat != 40.2 || s.ToLon != -3.6 {
		t.Errorf("To: got (%g, %g)", s.ToLat, s.ToLon)
	}
}

func TestParse_filtersZeroCoords(t *testing.T) {
	segs, err := Parse(strings.NewReader(xmlZeroCoords))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 0 {
		t.Errorf("expected 0 segments, got %d", len(segs))
	}
}

func TestParse_filtersPartialZeroCoords(t *testing.T) {
	segs, err := Parse(strings.NewReader(xmlPartialZero))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 0 {
		t.Errorf("expected 0 segments, got %d", len(segs))
	}
}

func TestParse_mixedValidAndZero(t *testing.T) {
	segs, err := Parse(strings.NewReader(xmlMixed))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 1 {
		t.Fatalf("expected 1 segment, got %d", len(segs))
	}
	if segs[0].ID != "good" {
		t.Errorf("expected ID 'good', got %q", segs[0].ID)
	}
}

func TestParse_empty(t *testing.T) {
	segs, err := Parse(strings.NewReader("<root></root>"))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 0 {
		t.Errorf("expected 0 segments, got %d", len(segs))
	}
}

func TestParse_invalidXML(t *testing.T) {
	_, err := Parse(strings.NewReader("<not valid xml <<"))
	if err == nil {
		t.Error("expected error for invalid XML, got nil")
	}
}

func TestParse_multipleSegments(t *testing.T) {
	segs, err := Parse(strings.NewReader(xmlMultiple))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if len(segs) != 3 {
		t.Fatalf("expected 3 segments, got %d", len(segs))
	}
	ids := map[string]bool{"seg1": true, "seg2": true, "seg3": true}
	for _, s := range segs {
		if !ids[s.ID] {
			t.Errorf("unexpected segment ID %q", s.ID)
		}
	}
}
