package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import com.example.legacy.lib.SampleService;

@Controller
@RequestMapping("/sample")
public class SampleController {
  private final SampleService sampleService = new SampleService();

  @RequestMapping("/list.as")
  public String list() {
    return "sample/list";
  }

  @RequestMapping("/detail.as")
  public String detail() {
    return "sample/detail";
  }

  @RequestMapping("/save.as")
  public String save() {
    return "sample/list";
  }

  @RequestMapping("/data.as")
  public void data() {
    sampleService.load();
  }
}
