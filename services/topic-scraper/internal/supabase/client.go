package supabase

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"time"
)

type Client struct {
	baseURL    string
	serviceKey string
	http       *http.Client
}

func New(baseURL, serviceKey string) *Client {
	return &Client{
		baseURL:    baseURL,
		serviceKey: serviceKey,
		http:       &http.Client{Timeout: 10 * time.Second},
	}
}

func (c *Client) Get(table string, query url.Values) ([]byte, error) {
	u := fmt.Sprintf("%s/rest/v1/%s?%s", c.baseURL, table, query.Encode())
	req, err := http.NewRequest("GET", u, nil)
	if err != nil {
		return nil, err
	}
	c.setHeaders(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("supabase GET %s: status %d: %s", table, resp.StatusCode, body)
	}
	return body, nil
}

func (c *Client) Post(table string, payload any, prefer string) ([]byte, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	u := fmt.Sprintf("%s/rest/v1/%s", c.baseURL, table)
	req, err := http.NewRequest("POST", u, bytes.NewReader(data))
	if err != nil {
		return nil, err
	}
	c.setHeaders(req)
	if prefer != "" {
		req.Header.Set("Prefer", prefer)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("supabase POST %s: status %d: %s", table, resp.StatusCode, body)
	}
	return body, nil
}

// PatchRaw issues a PATCH with a raw (un-encoded) PostgREST filter string,
// e.g. rawFilter = "id=in.(uuid1,uuid2)".
func (c *Client) PatchRaw(table string, rawFilter string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	u := fmt.Sprintf("%s/rest/v1/%s?%s", c.baseURL, table, rawFilter)
	req, err := http.NewRequest("PATCH", u, bytes.NewReader(data))
	if err != nil {
		return err
	}
	c.setHeaders(req)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		return fmt.Errorf("supabase PATCH %s: status %d: %s", table, resp.StatusCode, body)
	}
	return nil
}

func (c *Client) setHeaders(req *http.Request) {
	req.Header.Set("apikey", c.serviceKey)
	req.Header.Set("Authorization", "Bearer "+c.serviceKey)
	req.Header.Set("Content-Type", "application/json")
}
