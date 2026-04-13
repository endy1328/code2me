package com.example.legacy.web;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.RequestMapping;
import com.example.legacy.lib.ScreenService;

@Controller
@RequestMapping("/screen")
public class ScreenController {
  private final ScreenService screenService = new ScreenService();

  @RequestMapping("/list.do")
  public String list() {
    screenService.load();
    return "screen/list";
  }
}
