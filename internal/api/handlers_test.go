package api

import (
	"math"
	"testing"
)

// ── haversineKm ──────────────────────────────────────────────────────────────

func TestHaversineKm_samePoint(t *testing.T) {
	if d := haversineKm(40.4, -3.7, 40.4, -3.7); d != 0 {
		t.Errorf("same point: expected 0, got %g", d)
	}
}

func TestHaversineKm_oneDegreeLatitude(t *testing.T) {
	// 1° of latitude ≈ 111.32 km
	d := haversineKm(40.0, 0.0, 41.0, 0.0)
	if math.Abs(d-111.32) > 0.5 {
		t.Errorf("1° latitude: expected ~111.32 km, got %g", d)
	}
}

func TestHaversineKm_symmetric(t *testing.T) {
	d1 := haversineKm(40.4, -3.7, 41.5, 2.1)
	d2 := haversineKm(41.5, 2.1, 40.4, -3.7)
	if math.Abs(d1-d2) > 1e-9 {
		t.Errorf("distance not symmetric: %g vs %g", d1, d2)
	}
}

// ── sampleCoords ─────────────────────────────────────────────────────────────

// lineCoords generates n points along 0° longitude starting at startLat,
// spaced deltaLat degrees apart. Coords are [lon, lat] (GeoJSON order).
func lineCoords(startLat, deltaLat float64, n int) [][2]float64 {
	pts := make([][2]float64, n)
	for i := range pts {
		pts[i] = [2]float64{0, startLat + float64(i)*deltaLat}
	}
	return pts
}

func TestSampleCoords_emptySlice(t *testing.T) {
	out := sampleCoords(nil)
	if len(out) != 0 {
		t.Errorf("nil input: expected empty, got %d", len(out))
	}
}

func TestSampleCoords_singlePoint(t *testing.T) {
	in := [][2]float64{{0, 40.0}}
	out := sampleCoords(in)
	if len(out) != 1 {
		t.Errorf("single point: expected 1, got %d", len(out))
	}
}

func TestSampleCoords_twoPointsShortRoute(t *testing.T) {
	// Two points ~11 km apart (0.1° latitude). n = int(11/50)+1 = 1 → clamped to 2.
	in := lineCoords(40.0, 0.1, 2)
	out := sampleCoords(in)
	if len(out) != 2 {
		t.Errorf("short route: expected 2 samples, got %d", len(out))
	}
}

func TestSampleCoords_alwaysFirstAndLast(t *testing.T) {
	// 20 points covering ~222 km. Whatever n ends up being, first and last must match.
	in := lineCoords(40.0, 0.1, 20)
	out := sampleCoords(in)
	if out[0] != in[0] {
		t.Errorf("first sample must be coords[0]: got %v, want %v", out[0], in[0])
	}
	if out[len(out)-1] != in[len(in)-1] {
		t.Errorf("last sample must be coords[last]: got %v, want %v", out[len(out)-1], in[len(in)-1])
	}
}

func TestSampleCoords_capsAtTen(t *testing.T) {
	// 100 points covering ~1113 km. n = int(1113/50)+1 = 23 → capped to 10.
	in := lineCoords(0.0, 0.1, 100)
	out := sampleCoords(in)
	if len(out) != 10 {
		t.Errorf("long route: expected 10 samples (cap), got %d", len(out))
	}
}

func TestSampleCoords_denseMediumRoute(t *testing.T) {
	// 101 dense points at 0.01° spacing (≈1.11 km each) → 100 segments ≈ 111 km total.
	// n = int(111/50)+1 = 3.
	in := lineCoords(40.0, 0.01, 101)
	out := sampleCoords(in)
	if len(out) != 3 {
		t.Errorf("~111 km dense route: expected 3 samples, got %d", len(out))
	}
}

func TestSampleCoords_atLeastTwo(t *testing.T) {
	// Any route with ≥ 2 coords must return ≥ 2 samples.
	cases := [][][2]float64{
		lineCoords(40.0, 0.001, 2),  // very short
		lineCoords(40.0, 0.01, 2),   // short
		lineCoords(40.0, 0.5, 2),    // medium
		lineCoords(40.0, 1.0, 2),    // longer
	}
	for _, in := range cases {
		out := sampleCoords(in)
		if len(out) < 2 {
			t.Errorf("input len %d: expected ≥2 samples, got %d", len(in), len(out))
		}
	}
}

// ── validLatLon ──────────────────────────────────────────────────────────────

func TestValidLatLon(t *testing.T) {
	cases := []struct {
		lat, lon float64
		want     bool
	}{
		{0, 0, true},
		{40.4, -3.7, true},   // Madrid
		{90, 180, true},      // corner
		{-90, -180, true},    // corner
		{90.1, 0, false},     // lat too high
		{-90.1, 0, false},    // lat too low
		{0, 180.1, false},    // lon too high
		{0, -180.1, false},   // lon too low
		{999, 999, false},
	}
	for _, c := range cases {
		got := validLatLon(c.lat, c.lon)
		if got != c.want {
			t.Errorf("validLatLon(%g, %g) = %v, want %v", c.lat, c.lon, got, c.want)
		}
	}
}
