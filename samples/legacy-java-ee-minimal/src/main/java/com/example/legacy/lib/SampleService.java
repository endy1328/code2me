package com.example.legacy.lib;

import org.springframework.stereotype.Service;

@Service
public class SampleService {
  private final SampleDao sampleDao = new SampleDao();

  public void load() {
    sampleDao.toString();
  }
}
