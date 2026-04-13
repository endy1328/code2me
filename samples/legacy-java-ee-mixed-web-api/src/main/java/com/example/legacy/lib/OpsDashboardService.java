package com.example.legacy.lib;

import java.util.List;

public class OpsDashboardService {
  private final OpsDashboardDao opsDashboardDao = new OpsDashboardDao();

  public List<String> loadOverview() {
    return opsDashboardDao.loadOverview();
  }

  public List<String> exportOverview() {
    return opsDashboardDao.exportOverview();
  }
}
