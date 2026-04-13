package com.example.legacy.lib;

public class ReportService {
  ReportDao reportDao;

  public void setReportDao(ReportDao reportDao) {
    this.reportDao = reportDao;
  }

  public void loadReportList() {
    reportDao.selectReportList();
  }

  public void exportReportList() {
    reportDao.selectReportList();
  }
}
