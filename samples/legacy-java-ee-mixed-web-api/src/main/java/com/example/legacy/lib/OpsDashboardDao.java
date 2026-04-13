package com.example.legacy.lib;

import java.util.List;

public class OpsDashboardDao {
  public List<String> loadOverview() {
    return queryForList("com.example.legacy.lib.OpsDashboardDao.selectOverview");
  }

  public List<String> exportOverview() {
    return queryForList("com.example.legacy.lib.OpsDashboardDao.selectOverview");
  }
}
