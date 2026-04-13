package com.example.legacy.lib;

public class ScreenService {
  private final ScreenDao screenDao = new ScreenDao();

  public void load() {
    screenDao.selectList();
  }
}
