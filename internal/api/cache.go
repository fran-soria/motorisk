package api

import (
	"container/list"
	"crypto/sha256"
	"fmt"
	"sync"
	"time"
)

const NoExpiry = 365 * 24 * time.Hour

const maxCacheEntries = 1000

type cacheEntry struct {
	key       string
	data      []byte
	expiresAt time.Time
}

type Cache struct {
	mu      sync.Mutex
	entries map[string]*list.Element
	lru     *list.List
}

func NewCache() *Cache {
	c := &Cache{
		entries: make(map[string]*list.Element),
		lru:     list.New(),
	}
	go c.evict()
	return c
}

func (c *Cache) Get(key string) ([]byte, bool) {
	c.mu.Lock()
	defer c.mu.Unlock()
	el, ok := c.entries[key]
	if !ok {
		return nil, false
	}
	e := el.Value.(*cacheEntry)
	if time.Now().After(e.expiresAt) {
		c.removeElement(el)
		return nil, false
	}
	c.lru.MoveToFront(el)
	return e.data, true
}

func (c *Cache) Set(key string, data []byte, ttl time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if el, ok := c.entries[key]; ok {
		e := el.Value.(*cacheEntry)
		e.data = data
		e.expiresAt = time.Now().Add(ttl)
		c.lru.MoveToFront(el)
		return
	}
	el := c.lru.PushFront(&cacheEntry{key: key, data: data, expiresAt: time.Now().Add(ttl)})
	c.entries[key] = el
	// Evict least-recently-used entry when over capacity.
	for len(c.entries) > maxCacheEntries {
		c.removeElement(c.lru.Back())
	}
}

// removeElement removes an element from both the list and the map. Caller must hold mu.
func (c *Cache) removeElement(el *list.Element) {
	if el == nil {
		return
	}
	c.lru.Remove(el)
	delete(c.entries, el.Value.(*cacheEntry).key)
}

func (c *Cache) evict() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		c.mu.Lock()
		now := time.Now()
		for _, el := range c.entries {
			if now.After(el.Value.(*cacheEntry).expiresAt) {
				c.removeElement(el)
			}
		}
		c.mu.Unlock()
	}
}

func CacheKey(prefix string, data []byte) string {
	h := sha256.Sum256(data)
	// 64-bit prefix is sufficient; collision probability is negligible for this workload.
	return fmt.Sprintf("%s:%x", prefix, h[:8])
}
